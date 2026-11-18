import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import ssh2, { type Connection } from "ssh2";
import { CrestronSsh } from "../ssh.js";
import { processor } from "./fixtures.js";

test("native firmware SSH verifies VER, uploads only a new /firmware file with acknowledged bounded writes, and handles update disconnect without resending", async (t) => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs1" })
    .toString();
  const clients = new Set<Connection>(),
    commands: string[] = [];
  let uploaded = Buffer.alloc(0),
    existing = false,
    wrongSize = false,
    remotePath = "";
  const server = new ssh2.Server({ hostKeys: [key] }, (client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      if (ctx.method === "password" && ctx.password === processor.password)
        ctx.accept();
      else ctx.reject();
    });
    client.on("ready", () =>
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", () =>
          assert.fail("Firmware must not open a terminal"),
        );
        session.on("shell", () =>
          assert.fail("Firmware must not open a shell"),
        );
        session.on("exec", (accept, _reject, info) => {
          commands.push(info.command);
          const stream = accept();
          if (info.command === "ver -v") {
            stream.write(
              "CP4N>ver -v\r\nCP4N Cntrl Eng [v2.8006.00322 (Jun 18 2026), #95D21651] @E-c44268265d64\r\nBuild: Jun 18 2026 (602276)\r\nUpdater: 2.8006.00322\r\nBootloader: 02.019.000\r\nPUF: 2.8006.00322.01\r\nModelName: CP4N\r\nIOPVersion: S3 - IO Processor [v1.3177.00007, #FFFFFFFF] slot:6\r\nFIPS Mode: True\r\nCP4N>",
            );
            stream.exit(0);
            stream.end();
          } else {
            assert.ok(["puf all", "imgupd"].includes(info.command));
            setTimeout(() => client.end(), 5);
          }
        });
        session.on("sftp", (accept) => {
          const sftp = accept();
          sftp.on("OPENDIR", (id, path) => {
            assert.equal(path, "/firmware");
            sftp.handle(id, Buffer.from("dir"));
          });
          let listed = false;
          sftp.on("READDIR", (id) => {
            if (listed || (!existing && !remotePath))
              sftp.status(id, ssh2.utils.sftp.STATUS_CODE.EOF);
            else {
              listed = true;
              const name = existing
                ? "other.puf"
                : remotePath.split("/").at(-1)!;
              sftp.name(id, [
                {
                  filename: name,
                  longname: name,
                  attrs: {
                    mode: 0o100600,
                    size: uploaded.length,
                    uid: 0,
                    gid: 0,
                    atime: 0,
                    mtime: 0,
                  },
                },
              ]);
            }
          });
          sftp.on("OPEN", (id, path, flags) => {
            assert.match(path, /^\/firmware\/room-manager-[a-f0-9-]{36}\.puf$/);
            assert.equal(
              flags,
              ssh2.utils.sftp.OPEN_MODE.WRITE |
                ssh2.utils.sftp.OPEN_MODE.CREAT |
                ssh2.utils.sftp.OPEN_MODE.TRUNC |
                ssh2.utils.sftp.OPEN_MODE.EXCL,
            );
            remotePath = path;
            uploaded = Buffer.alloc(0);
            sftp.handle(id, Buffer.from("file"));
          });
          sftp.on("WRITE", (id, _handle, offset, bytes) => {
            assert.ok(bytes.length <= 32 * 1024);
            assert.equal(offset, uploaded.length);
            uploaded = Buffer.concat([uploaded, bytes]);
            sftp.status(id, ssh2.utils.sftp.STATUS_CODE.OK);
          });
          sftp.on("FSTAT", (id) =>
            sftp.attrs(id, {
              size: uploaded.length + (wrongSize ? 1 : 0),
              mode: 0o100600,
              mtime: 0,
              atime: 0,
              uid: 0,
              gid: 0,
            }),
          );
          sftp.on("CLOSE", (id) =>
            sftp.status(id, ssh2.utils.sftp.STATUS_CODE.OK),
          );
          for (const command of [
            "REMOVE",
            "RENAME",
            "MKDIR",
            "RMDIR",
            "SETSTAT",
          ])
            sftp.on(command, () =>
              assert.fail(`Firmware must not issue ${command}`),
            );
        });
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const ssh = new CrestronSsh({ verifyHostKey: false });
  const directory = await mkdtemp(join(tmpdir(), "firmware-ssh-")),
    path = join(directory, "source.puf");
  t.after(async () => {
    ssh.close();
    for (const client of clients) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const target = {
    ...processor,
    host: "127.0.0.1",
    sshPort: (server.address() as { port: number }).port,
    sshFingerprint: "",
  };
  const bytes = Buffer.alloc(80_123, 17);
  await writeFile(path, bytes);
  assert.equal((await ssh.version(target)).version, "2.8006.00322");
  const progress: number[] = [],
    remote = `room-manager-${crypto.randomUUID()}.puf`;
  await ssh.uploadFirmware(target, path, remote, "puf", (bytes) =>
    progress.push(bytes),
  );
  assert.deepEqual(uploaded, bytes);
  assert.equal(progress.at(-1), bytes.length);
  await ssh.startFirmware(target, "puf", {
    name: remote,
    bytes: bytes.length,
  });
  assert.deepEqual(commands, ["ver -v", "puf all"]);
  existing = true;
  await assert.rejects(
    () => ssh.uploadFirmware(target, path, remote, "puf", () => {}),
    /already contains/,
  );
  existing = false;
  remotePath = "";
  wrongSize = true;
  await assert.rejects(
    () => ssh.uploadFirmware(target, path, remote, "puf", () => {}),
    /size\/type was not verified/,
  );
  await assert.rejects(
    () => ssh.uploadFirmware(target, path, "../unsafe.puf", "puf", () => {}),
    /Invalid/,
  );
  assert.deepEqual(
    commands,
    ["ver -v", "puf all"],
    "failed uploads never dispatch update commands",
  );
});
