import assert from "node:assert/strict";
import test from "node:test";
import NvxDriver, { reportedControls } from "../.dist/index.js";

for (const dictionary of ["NaxTxStreams", "TxStreams"]) {
  test(`only writes a stream slot reported in ${dictionary}`, async () => {
    const writes = [];
    const driver = new NvxDriver("nvx", {
      host: "nvx.test", httpsPort: 443, username: "operator", password: "test", allowSelfSigned: false,
    }, () => ({
      close() {},
      async fetch(url, init) {
        const path = new URL(url).pathname;
        if (path === "/userlogin.html") {
          const headers = new Headers();
          if (init.method === "POST") {
            headers.append("set-cookie", "userid=1");
            headers.append("set-cookie", "userstr=test");
          }
          return new Response(null, { headers });
        }
        if (path === "/Device/NaxAudio/") return Response.json({
          Device: { NaxAudio: { NaxTx: { [dictionary]: { Stream01: { PortRequested: 5004 } } } } },
        });
        assert.equal(path, "/Device");
        writes.push(JSON.parse(init.body));
        return Response.json({ Actions: [{ Results: [{ StatusId: 0 }] }] });
      },
    }));
    try {
      await driver.api.connect();
      await assert.rejects(driver.api.setNax("Tx", "Stream1", "port", 5006), /did not report/);
      await driver.api.setNax("Tx", "Stream01", "port", 5006);
      assert.deepEqual(writes, [{ Device: { NaxAudio: { NaxTx: {
        [dictionary]: { Stream01: { PortRequested: 5006 } },
      } } } }]);
    } finally { driver.end(); }
  });
}

test("false-valued capabilities are present; missing control paths are not", () => {
  assert.deepEqual(reportedControls("DeviceSpecific", { LedsEnabled: false }).map(c => c.id), ["leds"]);
});

test("Dante surface follows individual port fields and exact source option group version", () => {
  const ports = { DantePorts: {
    Port3: { DanteAudioSource: "Auto", DanteAudioSourceOptionsName: "sources", DanteAudioSourceOptionsVersion: "2" },
    Port5: { DanteDeviceName: "Room-B", ActiveDanteAudioSource: "Input1" },
  } };
  const [source, name] = reportedControls("Dante", ports, { sources: { "2": ["Auto", "Input1"] } });
  assert.equal(source.id, "dante.Port3.source");
  assert.deepEqual(source.values, ["Auto", "Input1"]);
  assert.equal(name.id, "dante.Port5.name");
  assert.equal(reportedControls("Dante", ports, { sources: { "1": ["Auto"] } })[0].values, undefined);
  assert.deepEqual(reportedControls("Dante", { DantePorts: {} }), []);
});
