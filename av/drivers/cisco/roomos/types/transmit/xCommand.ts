import type { RoomOSDefaultResponse } from "../index";

export type TCommand = {
  Airplay: {
    KeyEvent: {
      Back: () => Promise<RoomOSDefaultResponse>;
      Click: () => Promise<RoomOSDefaultResponse>;
      Down: () => Promise<RoomOSDefaultResponse>;
      FastForward: () => Promise<RoomOSDefaultResponse>;
      FastReverse: () => Promise<RoomOSDefaultResponse>;
      Left: () => Promise<RoomOSDefaultResponse>;
      Play: () => Promise<RoomOSDefaultResponse>;
      Right: () => Promise<RoomOSDefaultResponse>;
      Up: () => Promise<RoomOSDefaultResponse>;
    };
    ResetPairedDevices: () => Promise<RoomOSDefaultResponse>;
  };
  Audio: {
    Diagnostics: {
      Advanced: {
        Run: () => Promise<RoomOSDefaultResponse>;
      };
      AecReverb: {
        Reset: () => Promise<RoomOSDefaultResponse>;
        Run: () => Promise<RoomOSDefaultResponse>;
      };
      MeasureDelay: () => Promise<RoomOSDefaultResponse>;
    };
    Equalizer: {
      List: () => Promise<RoomOSDefaultResponse>;
      Update: () => Promise<RoomOSDefaultResponse>;
    };
    LocalInput: {
      Add: () => Promise<RoomOSDefaultResponse>;
      AddConnector: () => Promise<RoomOSDefaultResponse>;
      Ethernet: {
        Deregister: () => Promise<RoomOSDefaultResponse>;
        PacketStatisticsReset: () => Promise<RoomOSDefaultResponse>;
        Register: () => Promise<RoomOSDefaultResponse>;
      };
      Remove: () => Promise<RoomOSDefaultResponse>;
      RemoveConnector: () => Promise<RoomOSDefaultResponse>;
      Update: () => Promise<RoomOSDefaultResponse>;
    };
    LocalOutput: {
      Add: () => Promise<RoomOSDefaultResponse>;
      AddConnector: () => Promise<RoomOSDefaultResponse>;
      ConnectInput: () => Promise<RoomOSDefaultResponse>;
      DisconnectInput: () => Promise<RoomOSDefaultResponse>;
      Ethernet: {
        Deregister: () => Promise<RoomOSDefaultResponse>;
        Register: () => Promise<RoomOSDefaultResponse>;
      };
      Remove: () => Promise<RoomOSDefaultResponse>;
      RemoveConnector: () => Promise<RoomOSDefaultResponse>;
      Update: () => Promise<RoomOSDefaultResponse>;
      UpdateInputGain: () => Promise<RoomOSDefaultResponse>;
    };
    Microphones: {
      MusicMode: {
        Start: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
      Mute: () => Promise<RoomOSDefaultResponse>;
      NoiseRemoval: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Deactivate: () => Promise<RoomOSDefaultResponse>;
      };
      Passthrough: {
        Start: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
      ToggleMute: () => Promise<RoomOSDefaultResponse>;
      Unmute3: () => Promise<RoomOSDefaultResponse>;
    };
    RemoteOutput: {
      ConnectInput: () => Promise<RoomOSDefaultResponse>;
      DisconnectInput: () => Promise<RoomOSDefaultResponse>;
      UpdateInputGain: () => Promise<RoomOSDefaultResponse>;
    };
    Select: () => Promise<RoomOSDefaultResponse>;
    Setup: {
      Clear: () => Promise<RoomOSDefaultResponse>;
      Reset: () => Promise<RoomOSDefaultResponse>;
    };
    Sound: {
      Play: () => Promise<RoomOSDefaultResponse>;
      Stop: () => Promise<RoomOSDefaultResponse>;
    };
    SoundsAndAlerts: {
      Ringtone: {
        List: () => Promise<RoomOSDefaultResponse>;
        Play: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
    };
    SpeakerCheck: () => Promise<RoomOSDefaultResponse>;
    Volume: {
      Decrease: () => Promise<RoomOSDefaultResponse>;
      Increase: () => Promise<RoomOSDefaultResponse>;
      Mute: () => Promise<RoomOSDefaultResponse>;
      Set: () => Promise<RoomOSDefaultResponse>;
      SetToDefault: () => Promise<RoomOSDefaultResponse>;
      ToggleMute: () => Promise<RoomOSDefaultResponse>;
      Unmute: () => Promise<RoomOSDefaultResponse>;
    };
    VuMeter: {
      Start: () => Promise<RoomOSDefaultResponse>;
      Stop: () => Promise<RoomOSDefaultResponse>;
      StopAll: () => Promise<RoomOSDefaultResponse>;
    };
  };
  Bluetooth: {
    Streaming: {
      Next: () => Promise<RoomOSDefaultResponse>;
      Pause: () => Promise<RoomOSDefaultResponse>;
      Play: () => Promise<RoomOSDefaultResponse>;
      Previous: () => Promise<RoomOSDefaultResponse>;
    };
  };
  Bookings: {
    Book: () => Promise<RoomOSDefaultResponse>;
    CheckIn: () => Promise<RoomOSDefaultResponse>;
    CheckOut: () => Promise<RoomOSDefaultResponse>;
    Clear: () => Promise<RoomOSDefaultResponse>;
    Delete: () => Promise<RoomOSDefaultResponse>;
    Edit: () => Promise<RoomOSDefaultResponse>;
    Extend: () => Promise<RoomOSDefaultResponse>;
    Get: () => Promise<RoomOSDefaultResponse>;
    List: () => Promise<RoomOSDefaultResponse>;
    NotificationSnooze: () => Promise<RoomOSDefaultResponse>;
    Put: () => Promise<RoomOSDefaultResponse>;
    Respond: () => Promise<RoomOSDefaultResponse>;
  };
  Call: {
    Accept: () => Promise<RoomOSDefaultResponse>;
    DTMFSend: () => Promise<RoomOSDefaultResponse>;
    Disconnect: () => Promise<RoomOSDefaultResponse>;
    FarEndControl: {
      Camera: {
        Move: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
      RequestCapabilities: () => Promise<RoomOSDefaultResponse>;
      RoomPreset: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Store: () => Promise<RoomOSDefaultResponse>;
      };
      Source: { Select: () => Promise<RoomOSDefaultResponse> };
    };
    FarEndMessage: { Send: () => Promise<RoomOSDefaultResponse> };
    Forward: () => Promise<RoomOSDefaultResponse>;
    Hold: () => Promise<RoomOSDefaultResponse>;
    Ignore: () => Promise<RoomOSDefaultResponse>;
    Join: () => Promise<RoomOSDefaultResponse>;
    Reject: () => Promise<RoomOSDefaultResponse>;
    Resume: () => Promise<RoomOSDefaultResponse>;
    UnattendedTransfer: () => Promise<RoomOSDefaultResponse>;
  };
  CallHistory: {
    AcknowledgeAllMissedCalls: () => Promise<RoomOSDefaultResponse>;
    AcknowledgeMissedCall: () => Promise<RoomOSDefaultResponse>;
    DeleteAll: () => Promise<RoomOSDefaultResponse>;
    DeleteEntry: () => Promise<RoomOSDefaultResponse>;
    Get: () => Promise<RoomOSDefaultResponse>;
    Recents: () => Promise<RoomOSDefaultResponse>;
  };
  Camera: {
    Boot: () => Promise<RoomOSDefaultResponse>;
    FactoryReset: () => Promise<RoomOSDefaultResponse>;
    InstallationTilt: {
      Ramp: () => Promise<RoomOSDefaultResponse>;
    };
    PositionReset: () => Promise<RoomOSDefaultResponse>;
    PositionSet: () => Promise<RoomOSDefaultResponse>;
    Preset: {
      Activate: () => Promise<RoomOSDefaultResponse>;
      ActivateDefaultPosition: () => Promise<RoomOSDefaultResponse>;
      Edit: () => Promise<RoomOSDefaultResponse>;
      List: () => Promise<RoomOSDefaultResponse>;
      Remove: () => Promise<RoomOSDefaultResponse>;
      Show: () => Promise<RoomOSDefaultResponse>;
      Store: () => Promise<RoomOSDefaultResponse>;
    };
    Ramp: () => Promise<RoomOSDefaultResponse>;
    TriggerAutofocus: () => Promise<RoomOSDefaultResponse>;
    TriggerWhitebalance: () => Promise<RoomOSDefaultResponse>;
  };
  Cameras: {
    AutoFocus: {
      Diagnostics: {
        Start: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
    };
    Background: {
      Clear: () => Promise<RoomOSDefaultResponse>;
      Delete: () => Promise<RoomOSDefaultResponse>;
      Fetch: () => Promise<RoomOSDefaultResponse>;
      ForegroundParameters: {
        Reset: () => Promise<RoomOSDefaultResponse>;
        Set: () => Promise<RoomOSDefaultResponse>;
      };
      Get: () => Promise<RoomOSDefaultResponse>;
      List: () => Promise<RoomOSDefaultResponse>;
      Set: () => Promise<RoomOSDefaultResponse>;
      Upload: () => Promise<RoomOSDefaultResponse>;
    };
    PresenterTrack: {
      ClearPosition: () => Promise<RoomOSDefaultResponse>;
      Set: () => Promise<RoomOSDefaultResponse>;
      StorePosition: () => Promise<RoomOSDefaultResponse>;
    };
    SpeakerTrack: {
      Activate: () => Promise<RoomOSDefaultResponse>;
      BackgroundMode: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Deactivate: () => Promise<RoomOSDefaultResponse>;
      };
      Calibration: {
        Diagnostics: {
          Start: () => Promise<RoomOSDefaultResponse>;
          Stop: () => Promise<RoomOSDefaultResponse>;
        };
      };
      Closeup: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Deactivate: () => Promise<RoomOSDefaultResponse>;
      };
      Deactivate: () => Promise<RoomOSDefaultResponse>;
      Diagnostics: {
        Start: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
      Frames: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Deactivate: () => Promise<RoomOSDefaultResponse>;
      };
      Set: () => Promise<RoomOSDefaultResponse>;
      ViewLimits: {
        Activate: () => Promise<RoomOSDefaultResponse>;
        Deactivate: () => Promise<RoomOSDefaultResponse>;
        StorePosition: () => Promise<RoomOSDefaultResponse>;
      };
      Whiteboard: {
        ActivatePosition: () => Promise<RoomOSDefaultResponse>;
        AlignPosition: () => Promise<RoomOSDefaultResponse>;
        SetDistance: () => Promise<RoomOSDefaultResponse>;
        StorePosition: () => Promise<RoomOSDefaultResponse>;
      };
    };
    Stereoscopic: {
      Mute: () => Promise<RoomOSDefaultResponse>;
      Unmute: () => Promise<RoomOSDefaultResponse>;
    };
  };
  Conference: {
    AdmitAll: () => Promise<RoomOSDefaultResponse>;
    Call: {
      AuthenticationResponse: () => Promise<RoomOSDefaultResponse>;
    };

    DoNotDisturb: {
      Activate: () => Promise<RoomOSDefaultResponse>;
      Deactivate: () => Promise<RoomOSDefaultResponse>;
    };
    EndMeeting: () => Promise<RoomOSDefaultResponse>;
    Hand: {
      Lower: () => Promise<RoomOSDefaultResponse>;
      Raise: () => Promise<RoomOSDefaultResponse>;
    };
    HardMute: () => Promise<RoomOSDefaultResponse>;
    Lock: () => Promise<RoomOSDefaultResponse>;
    LowerAllHands: () => Promise<RoomOSDefaultResponse>;
    MeetingAssistant: {
      Start: () => Promise<RoomOSDefaultResponse>;
      Stop: () => Promise<RoomOSDefaultResponse>;
    };
    MuteAll: () => Promise<RoomOSDefaultResponse>;
    MuteOnEntry: () => Promise<RoomOSDefaultResponse>;
    Participant: {
      Add: () => Promise<RoomOSDefaultResponse>;
      Admit: () => Promise<RoomOSDefaultResponse>;
      Disconnect: () => Promise<RoomOSDefaultResponse>;
      LowerHand: () => Promise<RoomOSDefaultResponse>;
      MoveToLobby: () => Promise<RoomOSDefaultResponse>;
      Mute: () => Promise<RoomOSDefaultResponse>;
      TransferRole: () => Promise<RoomOSDefaultResponse>;
    };
    ParticipantList: {
      Search: () => Promise<RoomOSDefaultResponse>;
    };

    PeopleFocus: {
      Activate: () => Promise<RoomOSDefaultResponse>;
      Deactivate: () => Promise<RoomOSDefaultResponse>;
    };
    Reaction: {
      Send: () => Promise<RoomOSDefaultResponse>;
      Enable: () => Promise<RoomOSDefaultResponse>;
      Disable: () => Promise<RoomOSDefaultResponse>;
    };
    Recording: {
      Pause: () => Promise<RoomOSDefaultResponse>;
      Resume: () => Promise<RoomOSDefaultResponse>;
      Start: () => Promise<RoomOSDefaultResponse>;
      Stop: () => Promise<RoomOSDefaultResponse>;
    };
    SendEmailInvitation: () => Promise<RoomOSDefaultResponse>;
    SimultaneousInterpretation: {
      SelectLanguage: () => Promise<RoomOSDefaultResponse>;
      SetMixer: () => Promise<RoomOSDefaultResponse>;
    };
    SkinTone: () => Promise<RoomOSDefaultResponse>;
    SpeakerLock: {
      Release: () => Promise<RoomOSDefaultResponse>;
    };
  };
  Macros: {
    Macro: {
      Activate: () => Promise<RoomOSDefaultResponse>;
      Deactivate: () => Promise<RoomOSDefaultResponse>;
      Get: () => Promise<RoomOSDefaultResponse>;
      Remove: () => Promise<RoomOSDefaultResponse>;
      RemoveAll: () => Promise<RoomOSDefaultResponse>;
      Rename: () => Promise<RoomOSDefaultResponse>;
      Roles: { Set: () => Promise<RoomOSDefaultResponse> };
      Save: () => Promise<RoomOSDefaultResponse>;
    };
    Runtime: {
      Restart: () => Promise<RoomOSDefaultResponse>;
      Start: () => Promise<RoomOSDefaultResponse>;
      Status: () => Promise<RoomOSDefaultResponse>;
      Stop: () => Promise<RoomOSDefaultResponse>;
    };
  };
  Message: {
    Send: ({}: { num: number }) => Promise<RoomOSDefaultResponse>;
  };
  MicrosoftTeams: {
    Install: () => Promise<RoomOSDefaultResponse>;
    Join: () => Promise<RoomOSDefaultResponse>;
    List: () => Promise<RoomOSDefaultResponse>;
    Reset: () => Promise<RoomOSDefaultResponse>;
    SignOut: () => Promise<RoomOSDefaultResponse>;
    SoftwareUpgrade: () => Promise<RoomOSDefaultResponse>;
  };
  Network: {
    SMTP: {
      VerifyConfig: () => Promise<RoomOSDefaultResponse>;
    };
    SNMP: {
      USM: {
        User: {
          Add: () => Promise<RoomOSDefaultResponse>;
          Delete: () => Promise<RoomOSDefaultResponse>;
          List: () => Promise<RoomOSDefaultResponse>;
        };
      };
    };
    Wifi: {
      Configure: () => Promise<RoomOSDefaultResponse>;
      Connect: () => Promise<RoomOSDefaultResponse>;
      Delete: () => Promise<RoomOSDefaultResponse>;
      List: () => Promise<RoomOSDefaultResponse>;
      Scan: {
        Start: () => Promise<RoomOSDefaultResponse>;
        Stop: () => Promise<RoomOSDefaultResponse>;
      };
    };
  };
  Peripherals: {
    Connect: () => Promise<RoomOSDefaultResponse>;
    DeviceManagement: {
      Disable: () => Promise<RoomOSDefaultResponse>;
    };
  };
};
