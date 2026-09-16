import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { Delimiters, Test } from "@nat-av/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import NatScreen, { NatScreenError } from "../index.js";
import {
  ControlRequestSchema,
  ControlResponseSchema,
  Status_Code,
  type ControlRequest,
  type ControlResponse,
} from "../proto/generated/media_control_pb.js";

const responseFrames = Delimiters.protobuf.lengthPrefixed32BE<
  ControlResponse,
  ControlRequest
>({
  encode: (response) => toBinary(ControlResponseSchema, response),
  decode: (payload) => fromBinary(ControlRequestSchema, payload),
  maxPayloadBytes: 65_536,
});

function decodeRequest(frame: Buffer): ControlRequest {
  const requests = responseFrames.delimiter(frame);
  assert.ok(requests);
  assert.equal(requests.length, 1);
  return requests[0];
}

function frameResponse(response: ControlResponse): Buffer {
  return responseFrames.formatter(response);
}

describe("nat screen driver", () => {
  it("sends framed protobuf requests and projects status into state", async () => {
    const socket = new Test.Socket();
    const driver = new NatScreen({ name: "screen", kind: "sender", socket });

    const pending = driver.api.getStatus();
    const request = decodeRequest(socket.writes[0]);
    assert.equal(request.protocolVersion, 2);
    assert.equal(request.requestId, 1n);
    assert.equal(request.request.case, "getStatus");

    const response = create(ControlResponseSchema, {
      protocolVersion: 2,
      requestId: request.requestId,
      revision: 7n,
      status: { code: Status_Code.OK },
      payload: {
        case: "runtimeStatus",
        value: {
          running: true,
          videoFrames: 12n,
          audioFrames: 13n,
          droppedPackets: 1n,
          bytesSent: 2_000n,
          bytesReceived: 0n,
        },
      },
    });
    const frame = frameResponse(response);
    socket.receive(frame.subarray(0, 6));
    socket.receive(frame.subarray(6));

    const runtimeStatus = await pending;
    assert.deepEqual(runtimeStatus, {
      running: true,
      videoFrames: "12",
      audioFrames: "13",
      droppedPackets: "1",
      bytesSent: "2000",
      bytesReceived: "0",
    });
    assert.equal(driver.state.revision, "7");
    assert.deepEqual(driver.state.runtimeStatus, runtimeStatus);
  });

  it("uses the observed revision for configuration mutations", async () => {
    const socket = new Test.Socket();
    const driver = new NatScreen({ name: "screen", kind: "sender", socket });

    const status = driver.api.getStatus();
    const statusRequest = decodeRequest(socket.writes[0]);
    socket.receive(
      frameResponse(
        create(ControlResponseSchema, {
          protocolVersion: 2,
          requestId: statusRequest.requestId,
          revision: 9n,
          status: { code: Status_Code.OK },
          payload: { case: "runtimeStatus", value: {} },
        }),
      ),
    );
    await status;

    const apply = driver.api.applySenderConfig({ formatVersion: 1 });
    const applyRequest = decodeRequest(socket.writes[1]);
    assert.equal(applyRequest.request.case, "applySenderConfig");
    if (applyRequest.request.case === "applySenderConfig") {
      assert.equal(applyRequest.request.value.expectedRevision, 9n);
    }

    socket.receive(
      frameResponse(
        create(ControlResponseSchema, {
          protocolVersion: 2,
          requestId: applyRequest.requestId,
          revision: 10n,
          status: { code: Status_Code.OK },
        }),
      ),
    );
    assert.equal(await apply, "10");
    assert.equal(driver.state.senderConfig?.formatVersion, 1);
  });

  it("dispatches unsolicited errors without consuming a pending response", async () => {
    const socket = new Test.Socket();
    const driver = new NatScreen({
      name: "screen",
      kind: "receiver",
      socket,
    });
    const errorEvent = driver.events.once("error");

    const pending = driver.api.getStatus();
    const request = decodeRequest(socket.writes[0]);
    socket.receive(
      frameResponse(
        create(ControlResponseSchema, {
          protocolVersion: 2,
          requestId: 0n,
          payload: {
            case: "error",
            value: { error: "degraded: monitor disconnected" },
          },
        }),
      ),
    );

    assert.equal((await errorEvent).error, "degraded: monitor disconnected");
    assert.equal(driver.state.lastError, "degraded: monitor disconnected");

    socket.receive(
      frameResponse(
        create(ControlResponseSchema, {
          protocolVersion: 2,
          requestId: request.requestId,
          status: { code: Status_Code.OK },
          payload: { case: "runtimeStatus", value: {} },
        }),
      ),
    );
    await pending;
  });

  it("turns device status failures into typed errors", async () => {
    const socket = new Test.Socket();
    const driver = new NatScreen({ name: "screen", kind: "sender", socket });

    const pending = driver.api.getStatus();
    const request = decodeRequest(socket.writes[0]);
    socket.receive(
      frameResponse(
        create(ControlResponseSchema, {
          protocolVersion: 2,
          requestId: request.requestId,
          revision: 4n,
          status: {
            code: Status_Code.CONFLICT,
            message: "stale revision",
          },
        }),
      ),
    );

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof NatScreenError);
      assert.equal(error.code, Status_Code.CONFLICT);
      assert.equal(error.revision, 4n);
      return true;
    });
  });

  it("rejects role-incompatible operations before writing", async () => {
    const socket = new Test.Socket();
    const driver = new NatScreen({ name: "screen", kind: "sender", socket });

    await assert.rejects(
      driver.api.applyReceiverConfig({ formatVersion: 2 }),
      /sender does not support receiver configuration/,
    );
    assert.equal(socket.writes.length, 0);
  });
});
