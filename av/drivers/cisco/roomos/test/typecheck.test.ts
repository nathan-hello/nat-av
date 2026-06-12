import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import type { Sockets } from "@av/types";

describe("typecheck", () => {
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
    strict: false,
    subscriptions: {
      xConfiguration: {
        Bluetooth: {
          Allowed: true,
        },
      },
      xStatus: {
        UserInterface: {
          WebView: true,
        },
      },
      xFeedback: {
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
    },
  });

  const strictRoomos = new CiscoRoomOS({
    name: "roomos-strict-typecheck",
    socket,
    strict: true,
    subscriptions: {
      xFeedback: {
        Bluetooth: {
          Streaming: {
            PlaybackPosition: true,
          },
        },
      },
    },
  });
  it("does not throw when accessing nested state obj", async () => {
    assert.doesNotThrow(async () => {
      // Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
      void roomos.state.xFeedback.PresentationPreviewStarted.Cause;

      void roomos.state.xStatus.UserInterface.WebView[0].Status;
      void roomos.state.xFeedback.IncomingCallIndication;

      const asdf = await strictRoomos.api.xStatus.Status.Cameras.Camera.get();
      if (asdf.ok) {
        asdf.data[0].LightingConditions;
      }

      const fdsa = await roomos.api.xCommand.Dial({ Number: "asdf" });

      // Should be 'number'
      void roomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition.Position;

      roomos.events.on("Bluetooth Streaming PlaybackPosition", (data) => {
        void data.Position;
      });

      void roomos.state.xStatus.Cameras.Camera[0].Position;

      strictRoomos.events.on("Bluetooth Streaming PlaybackPosition", () => {});

      strictRoomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition
        .Position;
      void strictRoomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition;
      // @ts-expect-error strict state omits unsubscribed public roots
      void strictRoomos.state.xConfiguration;
      // @ts-expect-error strict state omits unsubscribed public roots
      void strictRoomos.state.xStatus;
    });
  });
});
