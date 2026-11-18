export const nvxObjects = [
  "DeviceInfo",
  "DeviceSpecific",
  "Dante",
  "DeviceCapabilities",
  "NetworkAdapters",
  "Ethernet",
  "IpTable",
  "StreamReceive",
  "StreamTransmit",
  "AudioVideoInputOutput",
  "AvioV2",
  "EdidMgmnt",
  "AvRouting",
  "Usb",
  "NaxAudio",
  "Osd",
  "Identify",
  "TestPatternConfig",
  "Localization",
  "Preview",
  "XioSubscription",
  "DeviceOperations",
  "ImageMgmnt",
  "BackgroundImage",
  "CertificateStore",
  "Authentication",
  "ParentDevice",
] as const;
export type NvxObject = (typeof nvxObjects)[number];
export {
  nvxAdministration,
  nvxAdministrationChange,
  nvxSubscriptionEntryChange,
  nvxUploadRequest,
  redactNvxSecrets,
  nvxSubscriptionsFromXml,
  nvxSubscriptionsToXml,
  type NvxUpload,
  type NvxField,
} from "./administration.js";
/** Native subscription dictionaries; an empty dictionary clears all entries. */
export function nvxSubscriptionsChange(subscriptions: unknown): NvxChange {
  assertJsonObject(subscriptions);
  if (JSON.stringify(subscriptions).length > 32768)
    throw new Error("Subscriptions exceed 32 KiB.");
  return {
    object: "XioSubscription",
    patch: { Subscriptions: structuredClone(subscriptions) },
  };
}
export {
  nvxEdidLibrary,
  nvxCurrentEdid,
  nvxDeleteEdidChange,
  nvxEdidUploadRequest,
  validateEdidUpload,
  type EdidEntry,
} from "./edid.js";
/** Native REST JSON, deliberately narrower than unknown (and RPC's binary types). */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type NvxSnapshot = {
  objects: Partial<Record<NvxObject, JsonObject>>;
  readAt: string;
};
export type NvxState = { connected: boolean; snapshot: NvxSnapshot };

export function assertJsonObject(value: unknown): asserts value is JsonObject {
  const active = new Set<object>();
  const valid = (entry: unknown): boolean => {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean"
    )
      return true;
    if (typeof entry === "number") return Number.isFinite(entry);
    if (typeof entry !== "object" || active.has(entry)) return false;
    if (
      !Array.isArray(entry) &&
      Object.getPrototypeOf(entry) !== Object.prototype &&
      Object.getPrototypeOf(entry) !== null
    )
      return false;
    active.add(entry);
    const result = Object.values(entry).every(valid);
    active.delete(entry);
    return result;
  };
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !valid(value)
  )
    throw new Error(
      "Supply a plain JSON object containing only finite JSON values.",
      { cause: -32602 },
    );
}
export const nvxReadOnlyObjects: readonly NvxObject[] = [
  "DeviceInfo",
  "DeviceCapabilities",
  "ParentDevice",
];

export type NvxChange = { object: NvxObject; patch: Record<string, unknown> };
type Control = {
  id: string;
  label: string;
  object: NvxObject;
  path: readonly (string | number)[];
  values?: readonly string[];
  boolean?: boolean;
  trigger?: boolean;
  minimum?: number;
  maximum?: number;
  format?: "multicast" | "rtsp" | "uuid";
  optionsGroup?: { name: string; version?: string };
};
// Protocol shapes verified against DM NVX Tool 4.3.2.737 and the Crestron REST
// reference. These are device commands, not room workflows or UI-side writes.
export const nvxControls: readonly Control[] = [
  {
    id: "mode",
    label: "Device mode",
    object: "DeviceSpecific",
    path: ["DeviceMode"],
    values: ["Transmitter", "Receiver"],
  },
  {
    id: "reboot",
    label: "Reboot device",
    object: "DeviceOperations",
    path: ["Reboot"],
    trigger: true,
  },
  {
    id: "adaptive-bitrate",
    label: "Adaptive bitrate (legacy firmware)",
    object: "StreamTransmit",
    path: ["Streams", 0, "IsAdaptiveBitrateMode"],
    boolean: true,
  },
  {
    id: "nax-tx-mode",
    label: "Secondary audio transmit mode",
    object: "NaxAudio",
    path: ["SecondaryAudioTx", "AudioMode"],
    values: ["Automatic", "Manual", "Disabled"],
  },
  {
    id: "nax-rx-mode",
    label: "Secondary audio receive mode",
    object: "NaxAudio",
    path: ["SecondaryAudioRx", "AudioMode"],
    values: ["Automatic", "Manual", "Disabled"],
  },
  {
    id: "video",
    label: "Video source",
    object: "DeviceSpecific",
    path: ["VideoSource"],
    values: ["None", "Input1", "Input2", "Stream"],
  },
  {
    id: "audio",
    label: "Audio source",
    object: "DeviceSpecific",
    path: ["AudioSource"],
    values: [
      "AudioFollowsVideo",
      "Input1",
      "Input2",
      "AnalogAudio",
      "PrimaryStreamAudio",
      "SecondaryStreamAudio",
    ],
  },
  {
    id: "audio-mode",
    label: "Analog audio mode",
    object: "DeviceSpecific",
    path: ["AudioMode"],
    values: ["Insert", "Extract"],
  },
  {
    id: "leds",
    label: "Device LEDs",
    object: "DeviceSpecific",
    path: ["LedsEnabled"],
    boolean: true,
  },
  {
    id: "auto-init",
    label: "Automatic stream initiation",
    object: "DeviceSpecific",
    path: ["AutoInitiationMode"],
    boolean: true,
  },
  {
    id: "auto-route",
    label: "Automatic input routing",
    object: "DeviceSpecific",
    path: ["AutoInputRoutingEnabled"],
    boolean: true,
  },
  {
    id: "tx-start",
    label: "Start transmit stream",
    object: "StreamTransmit",
    path: ["Streams", 0, "Start"],
    trigger: true,
  },
  {
    id: "tx-stop",
    label: "Stop transmit stream",
    object: "StreamTransmit",
    path: ["Streams", 0, "Stop"],
    trigger: true,
  },
  {
    id: "rx-start",
    label: "Start receive stream",
    object: "StreamReceive",
    path: ["Streams", 0, "Start"],
    trigger: true,
  },
  {
    id: "rx-stop",
    label: "Stop receive stream",
    object: "StreamReceive",
    path: ["Streams", 0, "Stop"],
    trigger: true,
  },
  {
    id: "bitrate",
    label: "Transmit bitrate (Mbps)",
    object: "StreamTransmit",
    path: ["Streams", 0, "Bitrate"],
    minimum: 200,
    maximum: 950,
  },
  {
    id: "bitrate-mode",
    label: "Transmit bitrate mode",
    object: "StreamTransmit",
    path: ["Streams", 0, "BitrateMode"],
    values: ["Fixed", "Adaptive", "Variable"],
  },
  {
    id: "ttl",
    label: "Transmit multicast TTL",
    object: "StreamTransmit",
    path: ["Streams", 0, "MultiCastTtl"],
    minimum: 1,
    maximum: 255,
  },
  {
    id: "multicast",
    label: "Transmit multicast IPv4",
    object: "StreamTransmit",
    path: ["Streams", 0, "MulticastAddress"],
    format: "multicast",
  },
  {
    id: "stream-location",
    label: "Receive stream location",
    object: "StreamReceive",
    path: ["Streams", 0, "StreamLocation"],
    format: "rtsp",
  },
  {
    id: "usb-mode",
    label: "USB mode",
    object: "Usb",
    path: ["UsbPorts", 0, "Mode"],
    values: ["Local", "Remote"],
  },
  {
    id: "usb-transport",
    label: "USB transport",
    object: "Usb",
    path: ["UsbPorts", 0, "Transport"],
    values: ["Layer2", "Layer3"],
  },
  {
    id: "usb-auto",
    label: "Automatic USB pairing",
    object: "Usb",
    path: ["UsbPorts", 0, "IsAutoUsbPairingEnabled"],
    boolean: true,
  },
  {
    id: "usb-multiple",
    label: "Multiple USB devices",
    object: "Usb",
    path: ["UsbPorts", 0, "UsbPairing", "IsMultipleDeviceSupportEnabled"],
    boolean: true,
  },
  {
    id: "usb-remote",
    label: "USB remote device ID",
    object: "Usb",
    path: ["UsbPorts", 0, "RemoteDeviceId"],
    format: "uuid",
  },
  {
    id: "usb-pair",
    label: "Pair USB",
    object: "Usb",
    path: ["UsbPorts", 0, "Pair"],
    trigger: true,
  },
  {
    id: "usb-unpair",
    label: "Unpair USB",
    object: "Usb",
    path: ["UsbPorts", 0, "Unpair"],
    trigger: true,
  },
  {
    id: "route-video",
    label: "Route video source UUID",
    object: "AvRouting",
    path: ["Routes", 0, "VideoSource"],
    format: "uuid",
  },
  {
    id: "route-audio",
    label: "Route audio source UUID",
    object: "AvRouting",
    path: ["Routes", 0, "AudioSource"],
    format: "uuid",
  },
  {
    id: "route-usb",
    label: "Route USB source UUID",
    object: "AvRouting",
    path: ["Routes", 0, "UsbSource"],
    format: "uuid",
  },
  {
    id: "name",
    label: "Device display name",
    object: "Localization",
    path: ["Name"],
  },
  {
    id: "preview",
    label: "Preview output",
    object: "Preview",
    path: ["IsPreviewOutputEnabled"],
    boolean: true,
  },
  {
    id: "test-pattern",
    label: "Output test pattern",
    object: "TestPatternConfig",
    path: ["Outputs", "Output1", "CurrentTestPattern"],
    values: [
      "Off",
      "SMPTE ColorBars",
      "Black",
      "White",
      "Vertical Lines",
      "Grid",
      "Color Bars",
      "Gray Gradient",
      "RGB Gradient",
      "Frequency Adjust",
    ],
  },
];

/** Readable control paths actually present in this endpoint's response. */
/** Choices verified for a particular device-reported options group and version. */
export type NvxOptionGroups = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

export function reportedControls(name: NvxObject, data: JsonObject, groups: NvxOptionGroups = {}) {
  const controls: Control[] = nvxControls.filter(control => {
    if (control.object !== name) return false;
    let current: JsonValue = data;
    for (const key of control.path) {
      if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) return false;
      current = Array.isArray(current) ? current[Number(key)] : current[key];
    }
    return true;
  });
  function source(id: string, label: string, parent: JsonObject, prefix: string[], property: string) {
    if (typeof parent[property] !== "string") return;
    const group = parent[`${property}OptionsName`];
    const version = parent[`${property}OptionsVersion`];
    controls.push({
      id, label, object: name, path: [...prefix, property],
      ...(typeof group === "string" && typeof version === "string" && Object.hasOwn(groups, group) &&
          Object.hasOwn(groups[group], version) ? { values: groups[group][version] } : {}),
      ...(typeof group === "string" ? { optionsGroup: {
        name: group, ...(typeof version === "string" ? { version } : {}),
      } } : {}),
    });
  }
  if (name === "DeviceSpecific") source("nax-source", "NAX audio source", data, [], "NaxAudioSource");
  const ports = data.DantePorts;
  if (name === "Dante" && ports && typeof ports === "object" && !Array.isArray(ports)) {
    for (const [key, port] of Object.entries(ports)) {
      if (!port || typeof port !== "object" || Array.isArray(port)) continue;
      const path = ["DantePorts", key];
      source(`dante.${key}.source`, "Dante audio source", port, path, "DanteAudioSource");
      if (typeof port.DanteDeviceName === "string") controls.push({
        id: `dante.${key}.name`, label: "Dante device name", object: name,
        path: [...path, "DanteDeviceName"],
      });
    }
  }
  return controls;
}

export function nvxControlChange(id: string, input: unknown): NvxChange {
  const control = nvxControls.find((entry) => entry.id === id);
  if (!control) throw new Error("Choose a supported NVX control.");
  return controlChange(control, input);
}

export function controlChange(control: Control, input: unknown): NvxChange {
  let value: unknown = input;
  if (control.trigger) value = true;
  else if (control.boolean) {
    if (typeof value !== "boolean")
      throw new Error("Choose enabled or disabled explicitly.");
  } else if (control.values) {
    if (typeof value !== "string" || !control.values.includes(value))
      throw new Error("Choose a supported NVX value.");
  } else if (control.minimum !== undefined && control.maximum !== undefined) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < control.minimum ||
      value > control.maximum
    )
      throw new Error(`Value must be ${control.minimum}–${control.maximum}.`);
  } else {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 256 ||
      /[\x00-\x1f]/.test(value)
    )
      throw new Error(
        "Enter a value of 1–256 characters without control characters.",
      );
    if (control.format === "multicast") {
      const octets = value.split(".");
      if (
        octets.length !== 4 ||
        octets.some(
          (part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255,
        ) ||
        Number(octets[0]) < 224 ||
        Number(octets[0]) > 239
      )
        throw new Error(
          "Enter a multicast IPv4 address (224.0.0.0–239.255.255.255).",
        );
    }
    if (control.path.at(-1) === "DanteDeviceName" &&
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,29}[A-Za-z0-9])?$/.test(value))
      throw new Error("Use a Dante name of 1–31 letters, digits or internal hyphens.");
    if (
      control.format === "uuid" &&
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
    )
      throw new Error("Enter a device/source UUID.");
    if (control.format === "rtsp") {
      const url = new URL(value);
      if (
        url.protocol !== "rtsp:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith("/live.sdp")
      )
        throw new Error(
          "Use rtsp://device/live.sdp without embedded credentials, queries or fragments.",
        );
    }
  }
  // Paths are fixed protocol definitions, never caller-controlled object keys.
  for (const segment of [...control.path].reverse())
    value = typeof segment === "number" ? [value] : { [segment]: value };
  assertJsonObject(value);
  return { object: control.object, patch: value };
}

export function nvxEdidChange(
  input: 0 | 1,
  name: string,
  type: "System" | "Custom" | "Auto",
  avioV2: boolean,
): NvxChange {
  if (typeof avioV2 !== "boolean")
    throw new Error("Choose the AVIO schema explicitly with a boolean.");
  if (
    (input !== 0 && input !== 1) ||
    !name ||
    name.length > 256 ||
    /[\x00-\x1f]/.test(name) ||
    !["System", "Custom", "Auto"].includes(type)
  )
    throw new Error(
      "Choose HDMI input 1/2 and an EDID name/type reported by the device.",
    );
  if (avioV2)
    return {
      object: "AvioV2",
      patch: {
        Inputs: {
          [`Input${input + 1}`]: {
            InputInfo: { Ports: { Port1: { CurrentEdid: name } } },
          },
        },
      },
    };
  const inputs: Record<string, unknown>[] = [{}, {}];
  inputs[input] = {
    Ports: [{ Edid: { ApplyEdid: { Name: name, Type: type } } }],
  };
  return { object: "AudioVideoInputOutput", patch: { Inputs: inputs } };
}

export function nvxHdcpChange(
  input: 0 | 1,
  capability: string,
  avioV2: boolean,
): NvxChange {
  if (typeof avioV2 !== "boolean")
    throw new Error("Choose the AVIO schema explicitly with a boolean.");
  const capabilities: Record<string, string> = {
    Disabled: "HDCP Support Off",
    Auto: "Auto",
    HDCP14: "HDCP 1.4 Support",
    HDCP22: "HDCP 2.x Support",
  };
  if ((input !== 0 && input !== 1) || !Object.hasOwn(capabilities, capability))
    throw new Error("Choose HDMI input 1/2 and a supported HDCP capability.");
  if (avioV2)
    return {
      object: "AvioV2",
      patch: {
        Inputs: {
          [`Input${input + 1}`]: {
            InputInfo: {
              Ports: {
                Port1: {
                  Digital: { HdcpReceiverCapability: capabilities[capability] },
                },
              },
            },
          },
        },
      },
    };
  const inputs: Record<string, unknown>[] = [{}, {}];
  inputs[input] = {
    Ports: [
      {
        Hdmi: { HdcpReceiverCapability: capability },
        Dm: { HdcpReceiverCapability: capability },
      },
    ],
  };
  return { object: "AudioVideoInputOutput", patch: { Inputs: inputs } };
}

export const nvxScalerResolutions = [
  { index: 0, name: "Auto" },
  { index: 10, name: "1280x720@60" },
  { index: 30, name: "1920x1080@24" },
  { index: 31, name: "1920x1080@50" },
  { index: 32, name: "1920x1080@60" },
  { index: 33, name: "1920x1200@60RB" },
  { index: 44, name: "3840x2160@24" },
  { index: 45, name: "3840x2160@25" },
  { index: 46, name: "3840x2160@30" },
  { index: 50, name: "3840x2160@50" },
  { index: 51, name: "3840x2160@60" },
] as const;

export function nvxScalerChange(index: unknown, avioV2: boolean): NvxChange {
  if (typeof avioV2 !== "boolean")
    throw new Error("Choose the AVIO schema explicitly with a boolean.");
  const resolution = nvxScalerResolutions.find(
    (entry) => entry.index === index,
  );
  if (!resolution) throw new Error("Choose a supported scaler resolution.");
  return avioV2
    ? {
        object: "AvioV2",
        patch: {
          Outputs: {
            Output1: {
              OutputInfo: { Scaler: { UserResolutionIndex: resolution.index } },
            },
          },
        },
      }
    : {
        object: "AudioVideoInputOutput",
        patch: { Outputs: [{ Ports: [{ Resolution: resolution.name }] }] },
      };
}

export function nvxNaxChange(
  direction: string,
  streamId: string,
  action: string,
  value: unknown,
): NvxChange {
  if (!["Tx", "Rx"].includes(direction) || !/^Stream\d{1,2}$/.test(streamId))
    throw new Error(
      "Choose Tx/Rx and the exact NAX stream key reported by this firmware (for example Stream01).",
    );
  let property: string;
  if (action === "start" || action === "stop") {
    property = action === "start" ? "StartRequested" : "StopRequested";
    value = true;
  } else if (action === "auto") {
    if (typeof value !== "boolean")
      throw new Error("Choose automatic initiation explicitly.");
    property = "IsAutomaticInitiationEnabled";
  } else if (action === "port") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1025 || value > 65535)
      throw new Error("Use a UDP port between 1025 and 65535.");
    property = "PortRequested";
  } else if (action === "address") {
    if (value !== "0.0.0.0") nvxControlChange("multicast", value);
    property = "NetworkAddressRequested";
  } else if (action === "name" && direction === "Tx") {
    if (
      typeof value !== "string" ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,29}[A-Za-z0-9])?$/.test(value)
    )
      throw new Error(
        "Use a NAX session name of 1–31 letters, numbers or internal dashes.",
      );
    property = "SessionNameRequested";
  } else throw new Error("Unsupported NAX control.");
  return {
    object: "NaxAudio",
    patch: {
      [`Nax${direction}`]: {
        [`Nax${direction}Streams`]: { [streamId]: { [property]: value } },
      },
    },
  };
}
