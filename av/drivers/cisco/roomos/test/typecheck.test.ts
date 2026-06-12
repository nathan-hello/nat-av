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
    Bluetooth: {
      Streaming: {
        PlaybackPosition: true,
      },
    },
    IncomingCallIndication: true,
    PresentationPreviewStarted: true,
    UserInterface: {
      ScreenShotStored: true,
    },
  },
});

describe("typecheck", () => {
  it("does not throw when accessing nested state obj", () => {
    assert.doesNotThrow(() => {
      // Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
      void roomos.state.xFeedback.PresentationPreviewStarted.Cause;

      void roomos.state.xStatus.UserInterface.WebView[0].Status;
      void roomos.state.xFeedback.IncomingCallIndication;

      // Should be 'number'
      void roomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition.Position;

      roomos.events.on("Bluetooth Streaming PlaybackPosition", (data) => {
        void data.Position;
      });
    });
  });
});
