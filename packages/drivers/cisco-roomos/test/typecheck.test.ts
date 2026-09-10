import { Test } from "@nat-av/core";
import type CiscoRoomOS from "../index.js";
import type { GeneratedRoomOS, GeneratedRoomOSCommon } from "../generated.js";
import type { RemoteResult } from "../src/types.js";

type FeedbackSubscriptions = {
  xFeedback: {
    Bluetooth: {
      Streaming: {
        PlaybackPosition: true;
      };
    };
  };
};

declare const roomos: CiscoRoomOS<GeneratedRoomOS, "any", "any", false>;
declare const strictRoomos: CiscoRoomOS<
  GeneratedRoomOS,
  "any",
  "any",
  true,
  FeedbackSubscriptions
>;
declare const customRoomos: CiscoRoomOS<GeneratedRoomOS>;

type Status = Awaited<
  ReturnType<(typeof roomos.api.xStatus.Status.Cameras.Camera)["get"]>
>;
type DialArgs = Parameters<typeof roomos.api.xCommand.Dial>[0];
type PlaybackPosition =
  typeof roomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition;

type _statusIsTyped = Test.Assert<Test.NotEqual<Status, never>>;
type _dialArgs = Test.Assert<
  Test.Equal<
    DialArgs,
    {
      Appearance?: number;
      BookingId?: string;
      CallRate?: number;
      CallType?: "Audio" | "Auto" | "Video";
      DisplayName?: string;
      Number: string;
      Protocol?: "H323" | "Sip" | "Spark";
      TrackingData?: string;
    }
  >
>;
type _playbackPosition = Test.Assert<Test.NotEqual<PlaybackPosition, never>>;
type _customSchema = Test.Assert<
  Test.Equal<
    typeof customRoomos.api.xCommand.Dial,
    (args: {
      Appearance?: number;
      BookingId?: string;
      CallRate?: number;
      CallType?: "Audio" | "Auto" | "Video";
      DisplayName?: string;
      Number: string;
      Protocol?: "H323" | "Sip" | "Spark";
      TrackingData?: string;
    }) => RemoteResult<GeneratedRoomOSCommon.JsonValue>
  >
>;

if (false) {
  void roomos.api.xConfiguration.Configuration.UserInterface.OSD;
  void strictRoomos.state.xFeedback.Bluetooth.Streaming.PlaybackPosition
    .Position;

  strictRoomos.events.on("Bluetooth Streaming PlaybackPosition", (data) => {
    void data.Position;
  });

  // @ts-expect-error Strict state omits unsubscribed public roots.
  void strictRoomos.state.xConfiguration;

  // @ts-expect-error Command arguments must match the generated schema.
  roomos.api.xCommand.Dial({ Number: 123 });
}
