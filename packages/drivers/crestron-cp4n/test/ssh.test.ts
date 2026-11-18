import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer, type Socket } from "node:net";
import test, { type TestContext } from "node:test";
import ssh2, {
  type Attributes as SftpAttributes,
  type AuthenticationType,
  type Connection,
  type SFTPWrapper,
} from "ssh2";
import { hostFingerprint, CrestronSsh, type SshEndpoint } from "../ssh.js";
import { processor } from "./fixtures.js";
import { CrestronSshDriver } from "../ssh-driver.js";

const getSettings = (ssh: CrestronSsh, target: SshEndpoint) =>
  new CrestronSshDriver("test-device", target, ssh).api.readFile(
    "/user/settings.txt",
    256 * 1024,
  );

const { Server, utils } = ssh2;
const { STATUS_CODE: status, OPEN_MODE: mode } = utils.sftp;
const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ format: "pem", type: "pkcs1" })
  .toString();
const parsed = utils.parseKey(key);
assert.ok(!(parsed instanceof Error) && !Array.isArray(parsed));
const expectedFingerprint = hostFingerprint(parsed.getPublicSSH());
const file = Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf]),
  Buffer.from("---\r\nvideo_switcher:NVX\r\n"),
  Buffer.from([0xff]),
  Buffer.from("\r\n---"),
]);
type Attributes = Partial<SftpAttributes>;
type Options = {
  file?: Buffer;
  chunkBytes?: number;
  metadata?: number | ((request: number) => Attributes);
  auth?: "keyboard" | "reject";
  methods?: AuthenticationType[];
  prompts?: { prompt: string; echo: boolean }[];
  instructions?: string;
  repeatPrompt?: boolean;
  emptyChallenge?: boolean;
  noSftp?: boolean;
  openStatus?: number;
  closeStatus?: number;
  who?: string;
  read?: (
    sftp: SFTPWrapper,
    client: Connection,
    id: number,
    offset: number,
    length: number,
  ) => void;
};

async function fixture(t: TestContext, options: Options = {}) {
  const data = options.file ?? file;
  const requests: { offset: number; length: number }[] = [],
    passwords: string[] = [],
    answers: string[][] = [];
  const clients = new Set<Connection>();
  let opens = 0,
    closes = 0,
    metadataRequests = 0,
    keyboardRequests = 0;
  const server = new Server(
    {
      hostKeys: [key],
      ident: "Crestron-4-Series",
      greeting: "Authorized users only.\r\nCP4N>\r\n",
      banner: "\x1b[0mCrestron control system\r\nLogin:\r\nCP4N>\r\n",
    },
    (client) => {
      clients.add(client);
      client.on("close", () => clients.delete(client));
      client.on("error", () => {});
      client.on("authentication", (ctx) => {
        const allowed: AuthenticationType[] =
          options.methods ??
          (options.auth === "keyboard"
            ? ["keyboard-interactive"]
            : ["password", "keyboard-interactive"]);
        if (ctx.method === "password") {
          passwords.push(ctx.password);
          if (
            options.auth !== "keyboard" &&
            options.auth !== "reject" &&
            ctx.password === processor.password
          )
            ctx.accept();
          else ctx.reject(allowed);
        } else if (ctx.method === "keyboard-interactive") {
          keyboardRequests++;
          const prompt = () =>
            ctx.prompt(
              options.prompts ?? [{ prompt: "Password: ", echo: false }],
              "Crestron authentication",
              options.instructions ?? "",
              (response) => {
                answers.push(response);
                if (options.repeatPrompt && answers.length === 1) prompt();
                else if (
                  options.auth === "keyboard" &&
                  response.length === 1 &&
                  response[0] === processor.password
                )
                  ctx.accept();
                else ctx.reject(allowed);
              },
            );
          if (options.emptyChallenge)
            ctx.prompt(
              [],
              "Crestron banner",
              "Authorized users only",
              (response) => {
                assert.deepEqual(response, []);
                prompt();
              },
            );
          else prompt();
        } else ctx.reject(allowed);
      });
      client.on("ready", () =>
        client.on("session", (accept) => {
          const session = accept();
          session.on("pty", () =>
            assert.fail("Settings retrieval must not open a terminal."),
          );
          session.on("shell", () =>
            assert.fail("Settings retrieval must not open a console."),
          );
          session.on("exec", (accept, _reject, info) => {
            if (options.who === undefined) {
              assert.fail("Settings retrieval must not run commands.");
              return;
            }
            assert.equal(
              info.command,
              "who",
              "Only the fixed read-only WHO command is permitted",
            );
            const stream = accept();
            for (let index = 0; index < options.who.length; index += 7)
              stream.write(options.who.slice(index, index + 7));
            stream.exit(0);
            stream.end();
          });
          session.on("sftp", (accept, reject) => {
            if (options.noSftp) {
              reject?.();
              return;
            }
            const sftp = accept();
            sftp.on("FSTAT", (id) => {
              metadataRequests++;
              if (typeof options.metadata === "number")
                sftp.status(id, options.metadata);
              // SFTP allows omitted metadata fields despite @types requiring them.
              else
                sftp.attrs(
                  id,
                  (options.metadata?.(metadataRequests) ?? {
                    size: data.length,
                    mode: 0o100600,
                    uid: 0,
                    gid: 0,
                    atime: 1_700_000_000,
                    mtime: 1_700_000_000,
                  }) as SftpAttributes,
                );
            });
            sftp.on("OPEN", (id, path, flags) => {
              opens++;
              assert.equal(path, "/user/settings.txt");
              assert.equal(flags, mode.READ);
              if (options.openStatus) sftp.status(id, options.openStatus);
              else sftp.handle(id, Buffer.from("file-handle"));
            });
            sftp.on("READ", (id, _handle, offset, length) => {
              requests.push({ offset, length });
              if (options.read) options.read(sftp, client, id, offset, length);
              else if (offset >= data.length) sftp.status(id, status.EOF);
              else
                sftp.data(
                  id,
                  data.subarray(
                    offset,
                    offset + Math.min(length, options.chunkBytes ?? length),
                  ),
                );
            });
            sftp.on("CLOSE", (id) => {
              closes++;
              sftp.status(id, options.closeStatus ?? status.OK);
            });
            for (const request of [
              "WRITE",
              "REMOVE",
              "RENAME",
              "MKDIR",
              "RMDIR",
              "SETSTAT",
              "FSETSTAT",
            ])
              sftp.on(request, () =>
                assert.fail(`SFTP must not issue ${request}.`),
              );
          });
        }),
      );
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const ssh = new CrestronSsh();
  t.after(() => {
    ssh.close();
    for (const client of clients) client.end();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const target = {
    ...processor,
    host: "127.0.0.1",
    sshPort: (server.address() as { port: number }).port,
    sshFingerprint: expectedFingerprint,
  };
  return {
    target,
    ssh,
    requests,
    passwords,
    answers,
    counts: () => ({ opens, closes, metadataRequests, keyboardRequests }),
  };
}

test("SSH banners and console-looking prompts do not require shell parsing; only pinned, read-only SFTP is used", async (t) => {
  const f = await fixture(t);
  assert.equal(
    await f.ssh.fingerprint({ ...f.target, sshFingerprint: "" }),
    expectedFingerprint,
  );
  assert.equal(
    f.passwords.length,
    0,
    "host-key probe must not send credentials",
  );
  await assert.rejects(
    () => getSettings(f.ssh, { ...f.target, sshFingerprint: "" }),
    /explicitly trust/,
  );
  await assert.rejects(
    () =>
      getSettings(f.ssh, {
        ...f.target,
        sshFingerprint: processor.sshFingerprint,
      }),
    /fingerprint changed/,
  );
  assert.equal(
    f.passwords.length,
    0,
    "wrong key must be rejected before authentication",
  );
  const settings = await getSettings(f.ssh, f.target);
  assert.equal(settings.text, file.toString("utf8"));
  assert.equal(settings.bytes, file.length);
  assert.deepEqual(Buffer.from(settings.base64, "base64"), file);
  assert.equal(settings.modifiedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(Object.hasOwn(settings, "sha256"), false);
  assert.equal(f.passwords.length, 1);
  assert.equal(f.counts().closes, 1);
});

test("short SFTP packets preserve every byte and metadata is optional on embedded servers", async (t) => {
  for (const metadata of [status.OP_UNSUPPORTED, status.FAILURE])
    await t.test(`metadata status ${metadata}`, async (t) => {
      const f = await fixture(t, { chunkBytes: 7, metadata });
      const settings = await getSettings(f.ssh, f.target);
      assert.deepEqual(Buffer.from(settings.base64, "base64"), file);
      assert.equal(settings.modifiedAt, undefined);
      assert.deepEqual(
        f.requests.map((request) => request.offset),
        Array.from(
          { length: Math.ceil(file.length / 7) },
          (_, index) => index * 7,
        ).concat(file.length),
      );
      assert.equal(f.counts().closes, 1);
    });
});

test("keyboard-interactive-only authentication handles banner challenges without opening a console", async (t) => {
  const f = await fixture(t, { auth: "keyboard", emptyChallenge: true });
  assert.deepEqual(
    Buffer.from((await getSettings(f.ssh, f.target)).base64, "base64"),
    file,
  );
  assert.equal(f.passwords.length, 0);
  assert.deepEqual(f.answers, [[processor.password]]);
});

test("rejected SSH credentials are not resent using a second authentication method", async (t) => {
  const f = await fixture(t, { auth: "reject" });
  await assert.rejects(
    () => getSettings(f.ssh, f.target),
    /SSH authentication failed/,
  );
  assert.deepEqual(f.passwords, [processor.password]);
  assert.equal(f.counts().keyboardRequests, 0);
  assert.equal(f.counts().opens, 0);
});

test("omitted SSH authentication-method lists permit only one password attempt", async (t) => {
  const allowed = await fixture(t, { methods: [] });
  assert.deepEqual(
    Buffer.from(
      (await getSettings(allowed.ssh, allowed.target)).base64,
      "base64",
    ),
    file,
  );
  assert.deepEqual(allowed.passwords, [processor.password]);
  const rejected = await fixture(t, { methods: [], auth: "reject" });
  await assert.rejects(
    () => getSettings(rejected.ssh, rejected.target),
    /SSH authentication failed/,
  );
  assert.deepEqual(rejected.passwords, [processor.password]);
  assert.equal(rejected.counts().keyboardRequests, 0);
});

test("password-change, echoed, multi-field, and repeated challenges never receive unsafe password responses", async (t) => {
  const cases: Options[] = [
    { prompts: [{ prompt: "New password:", echo: false }] },
    { prompts: [{ prompt: "Password:", echo: true }] },
    {
      prompts: [
        { prompt: "Username:", echo: false },
        { prompt: "Password:", echo: false },
      ],
    },
    { prompts: [{ prompt: "Verification code:", echo: false }] },
    { instructions: "Your password has expired; change it now." },
    { repeatPrompt: true },
  ];
  for (const [index, options] of cases.entries())
    await t.test(`challenge ${index + 1}`, async (t) => {
      const f = await fixture(t, { ...options, auth: "keyboard" });
      await assert.rejects(
        () => getSettings(f.ssh, f.target),
        /Unsupported SSH authentication challenge/,
      );
      assert.equal(f.passwords.length, 0);
      assert.equal(f.answers.length, options.repeatPrompt ? 1 : 0);
      assert.equal(f.counts().opens, 0);
    });
});

test("missing files, permission errors, and unsupported SFTP fail clearly without a console fallback", async (t) => {
  for (const [options, message] of [
    [{ openStatus: status.NO_SUCH_FILE }, /not found/],
    [{ openStatus: status.PERMISSION_DENIED }, /permission denied/],
    [{ noSftp: true }, /did not open an SFTP subsystem/],
  ] as const)
    await t.test(message.source, async (t) => {
      const f = await fixture(t, options);
      await assert.rejects(() => getSettings(f.ssh, f.target), message);
      assert.equal(f.requests.length, 0);
    });
});

test("truncated, changed, and non-file settings snapshots are never returned as successful downloads", async (t) => {
  for (const [options, message] of [
    [
      { metadata: () => ({ size: file.length + 1 }) },
      /changed or was truncated/,
    ],
    [
      {
        metadata: (request: number) => ({
          size: file.length,
          atime: 1_700_000_000,
          mtime: 1_700_000_000 + request,
        }),
      },
      /changed or was truncated/,
    ],
    [
      { metadata: () => ({ size: file.length, mode: 0o040700 }) },
      /not a regular file/,
    ],
    [{ closeStatus: status.FAILURE }, /Failure/],
  ] as const)
    await t.test(message.source, async (t) => {
      const f = await fixture(t, options);
      await assert.rejects(() => getSettings(f.ssh, f.target), message);
      assert.equal(f.counts().closes, 1);
    });
});

test("SFTP enforces the byte limit with or without metadata and accepts an exact-limit file", async (t) => {
  const maximum = 256 * 1024;
  await t.test("oversized metadata", async (t) => {
    const f = await fixture(t, { metadata: () => ({ size: maximum + 1 }) });
    await assert.rejects(() => getSettings(f.ssh, f.target), /256 KiB/);
    assert.equal(f.requests.length, 0);
  });
  await t.test("oversized content without metadata", async (t) => {
    const f = await fixture(t, {
      metadata: status.OP_UNSUPPORTED,
      file: Buffer.alloc(maximum + 1, 0xff),
    });
    await assert.rejects(() => getSettings(f.ssh, f.target), /256 KiB/);
    assert.equal(f.requests.at(-1)?.length, 1);
  });
  await t.test("exact limit", async (t) => {
    const bytes = Buffer.alloc(maximum, 0xff),
      f = await fixture(t, { file: bytes });
    assert.deepEqual(
      Buffer.from((await getSettings(f.ssh, f.target)).base64, "base64"),
      bytes,
    );
    assert.equal(f.requests.at(-1)?.length, 1);
  });
  await t.test("empty file", async (t) => {
    const f = await fixture(t, { file: Buffer.alloc(0) });
    assert.equal((await getSettings(f.ssh, f.target)).bytes, 0);
  });
});

test("a dropped SFTP connection rejects partial data", async (t) => {
  const f = await fixture(t, {
    read(sftp, client, id, offset) {
      if (!offset) sftp.data(id, file.subarray(0, 7));
      else client.end();
    },
  });
  await assert.rejects(
    () => getSettings(f.ssh, f.target),
    /closed|ended|No response|disconnected/i,
  );
  assert.equal(f.requests.length, 2);
});

test("a stalled download is cancelled immediately on shutdown and cannot reconnect", async (t) => {
  let read!: () => void;
  const started = new Promise<void>((resolve) => {
    read = resolve;
  });
  const f = await fixture(t, {
    read() {
      read();
    },
  });
  const rejected = assert.rejects(
    () => getSettings(f.ssh, f.target),
    /shutting down/,
  );
  await started;
  f.ssh.close();
  await rejected;
  await assert.rejects(() => f.ssh.fingerprint(f.target), /service is closed/);
  await assert.rejects(() => getSettings(f.ssh, f.target), /service is closed/);
});

test("SFTP stalls have a bounded read deadline and never return partial data", async (t) => {
  const f = await fixture(t, {
    read(sftp, _client, id, offset) {
      if (!offset) sftp.data(id, file.subarray(0, 7));
    },
  });
  const ssh = new CrestronSsh({ timeoutMs: 1500 });
  t.after(() => ssh.close());
  await assert.rejects(
    () => getSettings(ssh, f.target),
    /SFTP read settings.txt timed out/,
  );
  assert.equal(f.requests.length, 2);
});

test("silent SSH peers have a bounded handshake deadline", async (t) => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const ssh = new CrestronSsh({ timeoutMs: 100 });
  t.after(() => {
    ssh.close();
    for (const socket of sockets) socket.destroy();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await assert.rejects(
    () =>
      ssh.fingerprint({
        ...processor,
        host: "127.0.0.1",
        sshPort: (server.address() as { port: number }).port,
      }),
    /host-key handshake timed out/,
  );
});

test("pinned WHO resolution uses one fixed exec command without a terminal or shell and rejects truncation", async (t) => {
  const who =
    "\r\nTableStart:[ Logic Connections ]\r\nAppID|Type|ID|Interface|Uptime|Address\r\n-----\r\n1|Gateway|40|CS|00:05:04.6694280|172.22.19.57\r\nTableStart:[ SPLUS Connections ]\r\n\r\nCP4N>";
  const f = await fixture(t, { who });
  await assert.rejects(
    () => f.ssh.connections({ ...f.target, sshFingerprint: "" }),
    /explicitly trust/,
  );
  await assert.rejects(
    () =>
      f.ssh.connections({
        ...f.target,
        sshFingerprint: processor.sshFingerprint,
      }),
    /fingerprint changed/,
  );
  assert.equal(f.passwords.length, 0);
  assert.deepEqual(await f.ssh.connections(f.target), [
    {
      slot: 1,
      ipId: "40",
      address: "172.22.19.57",
      interface: "CS",
      type: "Gateway",
    },
  ]);
  assert.equal(f.counts().opens, 0);
  const truncated = await fixture(t, { who: who.replace("CP4N>", "") });
  await assert.rejects(
    () => truncated.ssh.connections(truncated.target),
    /Incomplete/,
  );
});

test("deployment's unverified SSH mode accepts absent or changed host keys without a trust prompt", async (t) => {
  const f = await fixture(t);
  const ssh = new CrestronSsh({ verifyHostKey: false });
  t.after(() => ssh.close());
  assert.deepEqual(
    Buffer.from(
      (await getSettings(ssh, { ...f.target, sshFingerprint: "" })).base64,
      "base64",
    ),
    file,
  );
  assert.deepEqual(
    Buffer.from(
      (
        await getSettings(ssh, {
          ...f.target,
          sshFingerprint: processor.sshFingerprint,
        })
      ).base64,
      "base64",
    ),
    file,
  );
  assert.equal(f.passwords.length, 2);
});
