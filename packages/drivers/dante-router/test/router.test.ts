import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import DanteRouter from "../index.js";

describe("DanteRouter against simulated devices", () => {
  const router = new DanteRouter({
    name: "dante",
    simulate: [
      {
        name: "Stage-Box",
        tx: ["01|Kick", "02|Snare", "03", "04"],
        rx: [],
      },
      {
        name: "Console",
        tx: ["Mix-L", "Mix-R"],
        rx: Array.from({ length: 20 }, (_, i) => `In ${i + 1}`),
        sampleRate: 96000,
        subscriptions: { 1: { txDevice: "Stage-Box", txChannel: "01" } },
      },
    ],
  });

  before(async () => {
    await router.start();
    await router.api.refresh();
  });

  after(async () => {
    await router.end();
  });

  it("inventories devices and channels across pages", () => {
    assert.equal(router.state.scanStatus, "ready");
    const console = router.api.getDevice("Console");
    assert.ok(console);
    assert.equal(console.name, "Console");
    assert.equal(console.sampleRate, 96000);
    assert.equal(console.rxChannels.size, 20);
    assert.equal(console.rxChannels.get(17)?.name, "In 17");
    assert.deepEqual(
      [...console.txChannels.values()].map((ch) => ch.name),
      ["Mix-L", "Mix-R"],
    );

    const stage = router.api.getDevice("Stage-Box");
    assert.equal(stage?.txChannels.get(1)?.friendlyName, "Kick");
    assert.equal(stage?.txChannels.get(3)?.friendlyName, undefined);
  });

  it("reads existing subscriptions into the matrix", () => {
    // The matrix uses null-prototype records; compare by JSON shape.
    assert.deepEqual(JSON.parse(JSON.stringify(router.api.getMatrix())), {
      Console: { 1: { txDevice: "Stage-Box", txChannelName: "01" } },
    });
  });

  it("routes, unroutes and clears without a rescan", async () => {
    const scanAt = router.state.lastScanAt;

    await router.api.route("Console", 18, "Stage-Box", "02");
    assert.deepEqual(router.api.getMatrix().Console[18], {
      txDevice: "Stage-Box",
      txChannelName: "02",
    });

    await router.api.route("Console", 2, "Console", "Mix-R");
    assert.deepEqual(router.api.getMatrix().Console[2], {
      txDevice: "Console",
      txChannelName: "Mix-R",
    });

    await router.api.unroute("Console", 1);
    assert.equal(router.api.getMatrix().Console[1], undefined);

    await router.api.clearRoutes("Console");
    assert.equal(router.api.getMatrix().Console, undefined);
    assert.equal(router.state.lastScanAt, scanAt);
  });

  it("rejects routes to unknown receivers", async () => {
    await assert.rejects(
      router.api.route("Nope", 1, "Console", "Mix-L"),
      /RX device not found/,
    );
  });
});
