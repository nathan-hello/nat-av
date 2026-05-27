import CiscoRoomOS from "@av/drivers/cisco/roomos";
import type { RoomOS } from "@av/drivers/cisco/roomos/types";
import type { Sockets } from "@av/types";

const socket = {
  name: "roomos-typecheck",
  start() {},
  end() {},
  write() {
    return 0;
  },
  on() {
    return () => {};
  },
} satisfies Sockets.Socket;

const output: RoomOS.Format = {
  type: "jsonrpc",
  getId: () => 1,
};

const roomos = new CiscoRoomOS({
  name: "roomos-typecheck",
  product: "any",
  socket,
  output,
  subscriptions: {
    Audio: {
      Input: {
        Connectors: {
          Microphone: true,
        },
      },
    },
    Bluetooth: true,
    Conference: {
      ParticipantList: {
        ParticipantAdded: true,
      },
    },
  },
});

const roomosNested = new CiscoRoomOS({
  name: "roomos-typecheck-nested",
  product: "any",
  socket,
  output,
  subscriptions: {
    Bluetooth: {
      Streaming: {
        PlaybackPosition: true,
      },
    },
  } as const,
});

roomos.state.Audio.Input.Connectors.Microphone[0].UltrasoundSNR
roomos.state.Audio.Input.Connectors.Microphone[0].PPMeter

roomos.state.Bluetooth;
roomos.state.Conference.ParticipantList.ParticipantAdded;

roomos.api.xFeedback.Bluetooth.subscribe((value, state) => {
  value;
  state.Bluetooth;
});

roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe(
  (value, state) => {
    value.Position;
    state.Bluetooth.Streaming.PlaybackPosition;
  },
);

roomosNested.state.Bluetooth.Streaming.PlaybackPosition;

// @ts-expect-error This path was not subscribed.
roomos.state.Unsubscribed;
