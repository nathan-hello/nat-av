import assert from "node:assert/strict";
import test from "node:test";
import NvxDriver, { reportedControls } from "../.dist/index.js";

for (const dictionary of ["NaxTxStreams", "TxStreams"]) {
  test(`only writes a stream slot reported in ${dictionary}`, async () => {
    const writes = [];
    const driver = new NvxDriver(
      "nvx",
      {
        host: "nvx.test",
        httpsPort: 443,
        username: "operator",
        password: "test",
        allowSelfSigned: false,
      },
      () => ({
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
          if (path === "/Device/NaxAudio/")
            return Response.json({
              Device: {
                NaxAudio: {
                  NaxTx: {
                    [dictionary]: { Stream01: { PortRequested: 5004 } },
                  },
                },
              },
            });
          assert.equal(path, "/Device");
          writes.push(JSON.parse(init.body));
          return Response.json({ Actions: [{ Results: [{ StatusId: 0 }] }] });
        },
      }),
    );
    try {
      await driver.api.connect();
      await assert.rejects(
        driver.api.setNax("Tx", "Stream1", "port", 5006),
        /did not report/,
      );
      await driver.api.setNax("Tx", "Stream01", "port", 5006);
      assert.deepEqual(writes, [
        {
          Device: {
            NaxAudio: {
              NaxTx: {
                [dictionary]: { Stream01: { PortRequested: 5006 } },
              },
            },
          },
        },
      ]);
    } finally {
      driver.end();
    }
  });
}

test("false-valued capabilities are present; missing control paths are not", () => {
  assert.deepEqual(
    reportedControls("DeviceSpecific", { LedsEnabled: false }).map((c) => c.id),
    ["leds"],
  );
});

test("Dante surface follows individual port fields and exact source option group version", () => {
  const ports = {
    DantePorts: {
      Port3: {
        DanteAudioSource: "Auto",
        DanteAudioSourceOptionsName: "sources",
        DanteAudioSourceOptionsVersion: "2",
      },
      Port5: { DanteDeviceName: "Room-B", ActiveDanteAudioSource: "Input1" },
    },
  };
  const [source, name] = reportedControls("Dante", ports, {
    sources: { 2: ["Auto", "Input1"] },
  });
  assert.equal(source.id, "dante.Port3.source");
  assert.deepEqual(source.values, ["Auto", "Input1"]);
  assert.equal(name.id, "dante.Port5.name");
  assert.equal(
    reportedControls("Dante", ports, { sources: { 1: ["Auto"] } })[0].values,
    undefined,
  );
  assert.deepEqual(reportedControls("Dante", { DantePorts: {} }), []);
});

/** A fake NVX that answers GET /Device/<Object>/ from `objects` and records traffic. */
function device(objects) {
  const reads = [],
    writes = [];
  const driver = new NvxDriver(
    "nvx",
    {
      host: "nvx.test",
      httpsPort: 443,
      username: "operator",
      password: "test",
      allowSelfSigned: false,
    },
    () => ({
      close() {},
      async fetch(url, init = {}) {
        const path = new URL(url).pathname;
        if (path === "/userlogin.html") {
          const headers = new Headers();
          if (init.method === "POST") {
            headers.append("set-cookie", "userid=1");
            headers.append("set-cookie", "userstr=test");
          }
          return new Response(null, { headers });
        }
        if (init.method === "POST") {
          writes.push(JSON.parse(init.body));
          return Response.json({ Actions: [{ Results: [{ StatusId: 0 }] }] });
        }
        const name = path.split("/")[2];
        reads.push(name);
        return objects[name] ?
            Response.json({ Device: { [name]: objects[name] } })
          : new Response("Not Found", { status: 404 });
      },
    }),
  );
  return { driver, reads, writes };
}
const shared = {
  DeviceSpecific: {
    DeviceMode: "Receiver",
    VideoSource: "Stream",
    AudioSource: "AudioFollowsVideo",
  },
  // Shared firmware may answer for objects a model lacks.
  Dante: { DantePorts: { Port1: { DanteDeviceName: "nvx" } } },
  MultiViewLayout: {
    IsMultiviewEnabled: false,
    ActiveLayout: "1x1",
    MultiViewLayoutsSupported: ["1x1", "2x2"],
    WindowOverlayText: { WindowA: "", WindowB: "" },
    MvOsd: { IsEnabled: false },
  },
};

test("a DM-NVX-360 never probes or shows Dante or multiview", async () => {
  const { driver, reads, writes } = device({
    ...shared,
    DeviceInfo: {
      Model: "DM-NVX-360",
      DeviceVersion: "7.3.5",
      SerialNumber: "1",
    },
    DeviceCapabilities: {
      PortConfig: { NumberOfHdmiInputs: 1, NumberOfUsbCInputs: 0 },
    },
  });
  try {
    await driver.api.connect();
    const found = await driver.api.discover();
    assert.equal(found.profile.model, "DM-NVX-360");
    assert.equal(found.firmware, "7.3.5");
    assert.ok(!reads.includes("Dante") && !reads.includes("MultiViewLayout"));
    assert.deepEqual(found.withheld.map((w) => w.object).sort(), [
      "Dante",
      "MultiViewLayout",
    ]);
    assert.ok(
      found.objects.includes("DeviceSpecific") &&
        !found.objects.includes("Dante"),
    );
    assert.ok(found.unsupported.includes("Usb"));
    assert.ok(
      !found.controls.some(
        (c) => c.object === "Dante" || c.object === "MultiViewLayout",
      ),
    );
    // One HDMI input and the SDK's 36x audio sources narrow the generic controls.
    assert.deepEqual(found.controls.find((c) => c.id === "video").values, [
      "None",
      "Input1",
      "Stream",
    ]);
    assert.ok(
      !found.controls.find((c) => c.id === "audio").values.includes("Input2"),
    );
    await assert.rejects(
      driver.api.control("video", "Input2"),
      /supported NVX value/,
    );
    await assert.rejects(
      driver.api.set("Dante", {
        DantePorts: { Port1: { DanteDeviceName: "x" } },
      }),
      /DM-NVX-360 does not support Dante/,
    );
    await assert.rejects(
      driver.api.control("usb-mode", "Local"),
      /did not report control usb-mode/,
    );
    assert.deepEqual(writes, []);
  } finally {
    driver.end();
  }
});

test("a DM-NVX-384 shows multiview with the device's own layout list", async () => {
  const { driver, writes } = device({
    ...shared,
    DeviceInfo: {
      Model: "DM-NVX-384",
      DeviceVersion: "7.3.5",
      SerialNumber: "2",
    },
  });
  try {
    await driver.api.connect();
    const found = await driver.api.discover();
    assert.deepEqual(
      found.profile.features.includes("MultiviewControlsSetup"),
      true,
    );
    assert.deepEqual(found.inputs, { hdmi: 2, usbC: 2 });
    assert.ok(
      found.objects.includes("MultiViewLayout") &&
        !found.objects.includes("Dante"),
    );
    const ids = found.controls
      .filter((c) => c.object === "MultiViewLayout")
      .map((c) => c.id);
    assert.deepEqual(ids, [
      "mv-enabled",
      "mv-layout",
      "mv-osd",
      "mv.WindowA.text",
      "mv.WindowB.text",
    ]);
    assert.deepEqual(found.controls.find((c) => c.id === "mv-layout").values, [
      "1x1",
      "2x2",
    ]);
    await assert.rejects(
      driver.api.change("mv-layout", "3x2"),
      /supported NVX value/,
    );
    assert.deepEqual(await driver.api.change("mv-layout", "2x2"), {
      object: "MultiViewLayout",
      patch: { ActiveLayout: "2x2" },
    });
    await driver.api.control("mv-enabled", true);
    assert.deepEqual(writes, [
      { Device: { MultiViewLayout: { IsMultiviewEnabled: true } } },
    ]);
  } finally {
    driver.end();
  }
});

test("an undocumented model is not gated, and login clears discovery", async () => {
  const { driver } = device({
    ...shared,
    DeviceInfo: { Model: "DM-NVX-E30", SerialNumber: "3" },
  });
  try {
    await driver.api.connect();
    const found = await driver.api.discover();
    assert.equal(found.profile, undefined);
    assert.ok(
      found.objects.includes("Dante") &&
        found.objects.includes("MultiViewLayout"),
    );
    await driver.api.connect();
    assert.equal(driver.state.discovery, undefined);
  } finally {
    driver.end();
  }
});

test("discovery probes concurrently, at most six requests at a time", async () => {
  let active = 0, peak = 0;
  const driver = new NvxDriver("nvx", {
    host: "nvx.test", httpsPort: 443, username: "operator", password: "test", allowSelfSigned: false,
  }, () => ({
    close() {},
    async fetch(url, init = {}) {
      const path = new URL(url).pathname;
      if (path === "/userlogin.html") {
        const headers = new Headers();
        if (init.method === "POST") {
          headers.append("set-cookie", "userid=1");
          headers.append("set-cookie", "userstr=test");
        }
        return new Response(null, { headers });
      }
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      const name = path.split("/")[2];
      return name === "DeviceInfo"
        ? Response.json({ Device: { DeviceInfo: { Model: "DM-NVX-360" } } })
        : new Response("Not Found", { status: 404 });
    },
  }));
  try {
    await driver.api.connect();
    const found = await driver.api.discover();
    assert.equal(peak, 6);
    assert.ok(found.unsupported.length > 20);
  } finally { driver.end(); }
});
