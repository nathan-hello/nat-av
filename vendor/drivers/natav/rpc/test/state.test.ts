import { Manager } from "@av/drivers";
import { Test } from "@av/test/data.test";
import { RpcClient } from "@drivers/natav/rpc/client";
import { RpcServer } from "@drivers/natav/rpc/server";
import assert from "node:assert/strict";
import { it } from "node:test";

it("gets state automatically on connect", async () => {
  const socket = new Test.Socket();
  const driver = new Test.Driver({
    name: "shim-1",
    socket,
  });

  const transport = new Test.RpcTransport();

  const natav = new Manager({
    drivers: [driver],
    deferred: [(n) => new RpcServer(n, transport.server)],
  });
  type natav = typeof natav;

  await natav.Start();

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
