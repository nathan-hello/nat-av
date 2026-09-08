import { Natav } from "@nat-av/core";
import { Test } from "@nat-av/core";
import assert from "node:assert/strict";
import { it } from "node:test";
import Debugger from "./index.js";

it("preloads the debugger tree and appends messages to each node", async () => {
  const eventDriver = new Test.EventDriver("event-1");
  const natav = new Natav({
    drivers: [eventDriver] as const,
    plugin: [Debugger],
  });

  await natav.Start();

  const debug = natav.plugin.debugger;

  assert.equal(natav.plugin.debugger, debug);

  console.log(JSON.stringify(debug.state.view));
  assert.ok(debug);
  assert.equal(debug?.state.view[0]?.name, "event-1");
  assert.deepEqual(debug?.state.messages["event-1"], []);

  natav.bus.dispatch("natav:debug:socket", {
    name: "event-1",
    data: {
      traceName: "event-1",
      direction: "rx",
      time: 1,
      encoding: "utf8",
      data: new Uint8Array([1, 2, 3]),
    },
  });

  assert.deepEqual(debug?.state.messages["event-1"], [
    {
      traceName: "event-1",
      direction: "rx",
      time: 1,
      encoding: "utf8",
      data: [1, 2, 3],
    },
  ]);
});
