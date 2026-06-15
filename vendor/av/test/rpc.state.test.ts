import { Manager } from "@av/drivers";
import { RpcClient } from "@av/rpc/client";
import { RPCServer } from "@av/rpc/server";
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

  await natav.Start();

  const transport = new Test.RpcTransport();
  new RPCServer({ natav, transport: transport.server });
  const client = new RpcClient<(typeof natav)["configs"]>({ transport });
  transport.connect();

  assert.deepEqual(client.device("shim-1").state?.lastFrame, "init");

  socket.receive("asdf");

  assert.deepEqual(client.device("shim-1").state?.lastFrame, "asdf");

  socket.receive("fdsa");

  assert.deepEqual(client.device("shim-1").state?.lastFrame, "fdsa");

  socket.receive("zxcv");

  assert.deepEqual(client.device("shim-1").state?.lastFrame, "zxcv");
});
