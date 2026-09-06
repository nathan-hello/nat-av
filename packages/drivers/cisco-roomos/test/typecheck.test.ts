import { Test } from "@nat-av/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CiscoRoomOS } from "../index.js";
import type { GeneratedRoomOS } from "../generated.js";
import { version } from "node:os";

describe("typecheck", () => {
  const socket = new Test.Socket(
    [
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xGet",
          params: { Path: ["Status", "Cameras", "Camera"] },
          id: 0,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: {
            Camera: [],
          },
          id: 0,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xCommand/Dial",
          params: { Number: "asdf" },
          id: 0,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Number: "asdf" },
          id: 0,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xFeedback/Subscribe",
          params: {
            Query: ["Event"],
            NotifyCurrentValue: true,
          },
          id: 1,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Id: 1 },
          id: 1,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  const roomos = new CiscoRoomOS({
    name: "roomos-typecheck",
    product: "any",
    socket,
    strict: false,
    subscriptions: {
      xConfiguration: {
        UserInterface: true,
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

  roomos.api.xConfiguration.Configuration.UserInterface.OSD;

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

  const anyProductRoomos = new CiscoRoomOS({
    name: "roomos-any-product-typecheck",
    socket,
    product: "any",
    strict: false,
  });

  const versionedRoomos = new CiscoRoomOS({
    name: "roomos-version-typecheck",
    socket,
    product: "helix_55",
    version: "11.33.1 October 2025",
    strict: false,
  });

  const customRoomos = new CiscoRoomOS<GeneratedRoomOS>({
    name: "roomos-custom-schema-typecheck",
    socket,
    strict: true,
  });
  it("does not throw when accessing nested state obj", async () => {
    assert.doesNotThrow(async () => {
      // Should be `"userRequested" | "autoStart" | "autoStartDesktop" | "autoStartBackground" | "conferenceChanged" | "restartPreviewAfterCallEnded" | "startReceiving" | "floorGranted" | "airplayRequested" | "airplaySettings" | "deviceUnlocked" | "immersiveShare" | "unspecified"`
      void roomos.state.xFeedback.PresentationPreviewStarted.Cause;

      void roomos.state.xStatus.UserInterface.WebView[0].Status;
      void roomos.state.xFeedback.IncomingCallIndication;

      let test1 = await strictRoomos.api.xStatus.Status.Cameras.Camera.get();
      if (!test1.ok) {
        throw Error("asdf.ok");
      }

      let test2 = await roomos.api.xCommand.Dial({ Number: "asdf" });
      if (!test2.ok) {
        throw Error("asdf.ok");
      }

      await anyProductRoomos.api.xConfiguration.Configuration.UserInterface.OSD.EncryptionIndicator.set(
        "AlwaysOn",
      );

      await versionedRoomos.api.xCommand.Dial({ Number: "asdf" });
      await customRoomos.api.xCommand.Dial({ Number: "asdf" });

      await anyProductRoomos.api.xConfiguration.Configuration.UserInterface.OSD.EncryptionIndicator.set(
        // @ts-expect-error EncryptionIndicator accepts only documented literals.
        "On",
      );

      // Should be 'number'
      void roomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition.Position;

      roomos.events.on("Bluetooth Streaming PlaybackPosition", (data) => {
        void data.Position;
      });

      void roomos.state.xStatus.Cameras.Camera[0].Position;

      // xFeedback.get() is internal state, actually.
      await roomos.api.xFeedback.subscribe();

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
