import { Manager } from "@av/drivers";
import { RpcClient } from "@av/rpc/client";
import { RpcServer } from "@av/rpc/server";
import { Test } from "@av/test/data.test";
import assert from "node:assert/strict";
import { it } from "node:test";

it("gets state automatically on connect", async () => {
  const socket = new Test.Socket();
  const driver = new Test.Driver({
    name: "shim-1",
    socket,
  });

  const natav = new Manager({ drivers: [driver], deferred: [] });
  type natav = typeof natav;

  await natav.Start();

  const transport = new Test.RpcTransport();
  new RpcServer({ natav, transport: transport.server });
  const client = new RpcClient<natav>({ transport });

  const ready = new Promise<void>((resolve) => {
    const off = client.on("ready", () => {
      off();
      resolve();
    });
  });

  transport.connect();
  await ready;

  assert.deepEqual(client.driver("shim-1").state?.lastFrame, "init");

  socket.receive("asdf");

  assert.deepEqual(client.driver("shim-1").state?.lastFrame, "asdf");

  socket.receive("fdsa");

  assert.deepEqual(client.driver("shim-1").state?.lastFrame, "fdsa");

  socket.receive("zxcv");

  assert.deepEqual(client.driver("shim-1").state?.lastFrame, "zxcv");

  client.close();
});
