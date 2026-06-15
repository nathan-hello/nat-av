import { Manager } from "@av/drivers";
import { Debugger } from "@av/drivers/builtin/debug";
import { Test } from "@av/test/data";
import assert from "node:assert/strict";
import { it } from "node:test";

it("preloads the debugger tree and appends messages to each node", () => {
  const eventDriver = new Test.EventDriver("event-1");
  const natav = new Manager({
    drivers: [eventDriver],
    deferred: [Debugger],
  });

  const debuggerDriver = natav.GetDriver("debugger");

  assert.ok(debuggerDriver);
  assert.equal(debuggerDriver?.state.tree["event-1"]?.meta.name, "event-1");
  assert.deepEqual(debuggerDriver?.state.tree["event-1"]?.messages, []);

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

  assert.deepEqual(debuggerDriver?.state.tree["event-1"]?.messages, [
    {
      traceName: "event-1",
      direction: "rx",
      time: 1,
      encoding: "utf8",
      data: [1, 2, 3],
    },
  ]);
});
