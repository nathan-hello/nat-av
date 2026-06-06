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
    Audio: true,
    Bluetooth: true,
    Conference: true,
    PresentationPreviewStarted: true,
    UserInterface: true,
  },
});

describe("typecheck", () => {
  it("does not throw when accessing nested state obj", () => {
    assert.doesNotThrow(() => {
      void roomos.state.UserInterface.ScreenShotStored.Type;
    });
  });
});

// Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
roomos.state.PresentationPreviewStarted.Cause;

roomos.state.Conference.ParticipantList.AddToRemoteConferenceStarted.CallId;

roomos.state.UserInterface.WebView[0].Status;

roomos.state.Bluetooth.Streaming.PlaybackPosition;
roomos.state.Bluetooth.Streaming.PlaybackPosition;
