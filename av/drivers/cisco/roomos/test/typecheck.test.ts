import CiscoRoomOS from "@av/drivers/cisco/roomos";
import type { RoomOS } from "@av/drivers/cisco/roomos/types";
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

const output: RoomOS.Format = {
  type: "jsonrpc",
  getId: () => 1,
};

const roomos = new CiscoRoomOS({
  name: "roomos-typecheck",
  socket,
  output,
  subscriptions: {
    Audio: true,
    Bluetooth: true,
    Conference: true,
  },
});

roomos.state.Audio.Input.Connectors.Microphone[0].LoudspeakerActivity;

roomos.state.Audio.Input.Connectors.Microphone[0].AudioPairingRate;
roomos.state.Audio.Input.Connectors.Microphone[0].LoudspeakerActivity;

roomos.state.Bluetooth;
roomos.state.Conference.ParticipantList.AddToRemoteConferenceStarted.CallId;

roomos.api.xFeedback.CallTransfer.subscribe((value, state) => {
  value.ProgressIndication.Progress;
  state.Bluetooth;
});

roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe(
  (value, state) => {
    value.Position;
    state.Bluetooth.Streaming.PlaybackPosition;
  },
);
