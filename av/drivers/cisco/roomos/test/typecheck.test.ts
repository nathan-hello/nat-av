import CiscoRoomOS from "@av/drivers/cisco/roomos";
import type { TOutput } from "@av/drivers/cisco/roomos/types";
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

const output = {
  type: "jsonrpc",
  getId: () => 1,
} satisfies TOutput;

const roomos = new CiscoRoomOS({
  name: "roomos-typecheck",
  product: "any",
  socket,
  output,
  subscriptions: [
    ["Bluetooth"],
    ["Conference", "ParticipantList", "ParticipantAdded"],
  ] as const,
});

if (false) {
  roomos.state.Bluetooth;
  roomos.state.Conference.ParticipantList.ParticipantAdded;

  roomos.api.xFeedback.Bluetooth.subscribe((value, state) => {
    value;
    state.Bluetooth;
  });

  roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe((value, state) => {
    value.Position;
    state.Bluetooth.Streaming.PlaybackPosition;
  });

  // @ts-expect-error This path was not subscribed.
  roomos.state.Unsubscribed;
}
