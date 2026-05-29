import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import type { Sockets } from "@av/types";

const socket: Sockets.Socket = {
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

// describe("typecheck", () => {
//   it("does not throw when accessing nested state obj", () => {
//     assert.doesNotThrow(() => {
//       void roomos.state.UserInterface.ScreenShotStored.Type;
//     });
//   });
// });

if (false) {
  // Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
  roomos.state.PresentationPreviewStarted.Cause;

  roomos.state.Conference.ParticipantList.AddToRemoteConferenceStarted.CallId;

  roomos.api.xFeedback.CallTransfer.subscribe((value, state) => {
    value.ProgressIndication.Progress;
    state.Bluetooth;
  });
  roomos.state.UserInterface.WebView[0].Status;

  roomos.api.xCommand.Dial({ Number: "123445" });

  roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe(
    (value, state) => {
      value.Position;
      state.Bluetooth.Streaming.PlaybackPosition;
    },
  );

  roomos.state.Bluetooth.Streaming.PlaybackPosition;
  roomos.state.Bluetooth.Streaming.PlaybackPosition;

  const asdf = roomos.api.xConfiguration.SerialPort.LoginRequired.get();
}
