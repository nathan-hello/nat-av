import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import type { Sockets } from "@av/types";

const socket: Sockets.Client = {
  name: "roomos-typecheck",
  start() {},
  end() {},
  write() {
    return 0;
  },
  on() {
    return () => {};
  },
};

const roomos = new CiscoRoomOS({
  name: "roomos-typecheck",
  socket,
  subscriptions: {
    Event: true,
    Status: true,
  },
});

describe("typecheck", () => {
  it("does not throw when accessing nested state obj", () => {
    assert.doesNotThrow(() => {
      void roomos.state.Event.UserInterface.ScreenShotStored.Type;
      // Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
      void roomos.state.Event.PresentationPreviewStarted.Cause;

      void roomos.state.Status.UserInterface.WebView[0].Status;

      void roomos.state.Event.IncomingCallIndication

      // Should be 'number'
      void roomos.state.Event.Bluetooth.Streaming.PlaybackPosition.Position;
    });
  });
});
