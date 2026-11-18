import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import {
  assertJsonObject,
  type JsonObject,
  type NvxChange,
  type NvxObject,
} from "./catalog.js";

export type NvxField = {
  id: string;
  label: string;
  options?: readonly string[];
  type?: "password" | "number" | "file";
  value?: string;
};
export const nvxAdministration = [
  {
    id: "network",
    label: "Network",
    object: "Ethernet",
    fields: [
      { id: "host", label: "Host name" },
      { id: "dhcp", label: "DHCP", options: ["true", "false"] },
      { id: "address", label: "Static IPv4 address" },
      { id: "mask", label: "Subnet mask" },
      { id: "gateway", label: "Default gateway", value: "0.0.0.0" },
      { id: "dns1", label: "Primary DNS", value: "0.0.0.0" },
      { id: "dns2", label: "Secondary DNS", value: "0.0.0.0" },
    ],
  },
  {
    id: "igmp",
    label: "IGMP version",
    object: "Ethernet",
    fields: [{ id: "version", label: "Version", options: ["v2", "v3"] }],
  },
  {
    id: "ip-table",
    label: "IP table",
    object: "IpTable",
    fields: [
      {
        id: "action",
        label: "Action",
        options: ["AddEntries", "RemoveEntries"],
      },
      { id: "address", label: "Processor address" },
      { id: "ipId", label: "IP ID (hex)" },
      { id: "program", label: "Program instance (optional)" },
    ],
  },
  {
    id: "background",
    label: "Background display",
    object: "BackgroundImage",
    fields: [
      { id: "enabled", label: "Enabled", options: ["true", "false"] },
      { id: "source", label: "Source", options: ["Local", "Remote"] },
      {
        id: "mode",
        label: "Display mode",
        options: ["Maintain", "Stretch", "OneToOne"],
      },
      { id: "wait", label: "Wait time (seconds)", type: "number", value: "0" },
      { id: "name", label: "Local image name (local source)" },
      { id: "url", label: "Server URL (remote source)" },
      {
        id: "refresh",
        label: "Refresh remote image",
        options: ["false", "true"],
      },
      {
        id: "minutes",
        label: "Refresh interval (minutes)",
        type: "number",
        value: "5",
      },
    ],
  },
  {
    id: "background-upload",
    label: "Upload background",
    object: "ImageMgmnt",
    fields: [
      { id: "slot", label: "Image slot", type: "number", value: "1" },
      { id: "file", label: "Image file (.jpg/.png)", type: "file" },
    ],
  },
  {
    id: "background-delete",
    label: "Delete background",
    object: "ImageMgmnt",
    fields: [{ id: "slot", label: "Image slot", type: "number", value: "1" }],
  },
  {
    id: "certificate-upload",
    label: "Install certificate",
    object: "CertificateStore",
    fields: [
      {
        id: "store",
        label: "Certificate store",
        options: ["Root", "Intermediate", "Machine", "WebServer"],
      },
      { id: "file", label: "Certificate file", type: "file" },
      { id: "password", label: "PKCS#12 password", type: "password" },
    ],
  },
  {
    id: "certificate-delete",
    label: "Remove certificate",
    object: "CertificateStore",
    fields: [
      {
        id: "store",
        label: "Certificate store",
        options: ["Root", "Intermediate", "Machine", "WebServer"],
      },
      { id: "name", label: "Certificate name" },
      { id: "uuid", label: "Certificate UUID" },
    ],
  },
  {
    id: "password",
    label: "Change device password",
    object: "Authentication",
    fields: [
      { id: "username", label: "Current user name" },
      { id: "currentPassword", label: "Current password", type: "password" },
      { id: "password", label: "New password", type: "password" },
    ],
  },
  {
    id: "restore",
    label: "Factory restore",
    object: "DeviceOperations",
    fields: [],
  },
  {
    id: "subscription-entry",
    label: "Edit stream subscription",
    object: "XioSubscription",
    fields: [
      { id: "action", label: "Action", options: ["Add or update", "Remove"] },
      { id: "key", label: "Subscription UUID" },
      { id: "address", label: "Transmitter address" },
      { id: "name", label: "Input name" },
      { id: "position", label: "Position", type: "number", value: "1" },
      { id: "rtsp", label: "RTSP URL" },
      { id: "multicast", label: "Multicast address" },
    ],
  },
] satisfies readonly {
  id: string;
  label: string;
  object: NvxObject;
  fields: NvxField[];
}[];

export type NvxUpload = {
  object: NvxObject;
  path: string;
  fields: Record<string, string>;
  field: string;
  name: string;
  base64: string;
  mime: string;
};
const text = (value: unknown, label: string, optional = false) => {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`Invalid ${label}.`);
  return value;
};
const choice = (value: unknown, values: readonly string[]) => {
  if (typeof value !== "string" || !values.includes(value))
    throw new Error(`Choose ${values.join(" / ")}.`);
  return value;
};
const integer = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  if (value === "" || !Number.isInteger(n) || n < min || n > max)
    throw new Error(`Enter a number from ${min} to ${max}.`);
  return n;
};
const ipv4 = (value: unknown) => {
  const s = text(value, "IPv4 address");
  if (
    !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(s) ||
    s.split(".").some((n) => Number(n) > 255)
  )
    throw new Error("Enter a dotted IPv4 address.");
  return s;
};
const host = (value: unknown) => {
  const s = text(value, "host name");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(s) || s.includes(".."))
    throw new Error("Enter a host name or IPv4 address.");
  return s;
};
const bool = (value: unknown) =>
  typeof value === "boolean" ? value : (
    choice(value, ["true", "false"]) === "true"
  );
const store = (value: unknown) =>
  choice(value, ["Root", "Intermediate", "Machine", "WebServer"]);
const slot = (value: unknown) =>
  `Image${String(integer(value, 1, 20)).padStart(2, "0")}`;

/** Build the verified native payload without transport, routing, or UI policy. */
export function nvxAdministrationChange(
  id: string,
  v: Record<string, unknown>,
): NvxChange {
  switch (id) {
    case "restore":
      return { object: "DeviceOperations", patch: { Restore: true } };
    case "igmp":
      return {
        object: "Ethernet",
        patch: { IgmpVersion: choice(v.version, ["v2", "v3"]) },
      };
    case "network": {
      const dhcp = bool(v.dhcp);
      const settings: JsonObject = { IsDhcpEnabled: dhcp };
      if (!dhcp) {
        settings.StaticAddresses = [
          { Address: ipv4(v.address), SubnetMask: ipv4(v.mask) },
        ];
        settings.StaticDefaultGateway = ipv4(v.gateway);
        settings.StaticDns = [ipv4(v.dns1), ipv4(v.dns2)];
      }
      return {
        object: "Ethernet",
        patch: { HostName: host(v.host), Adapters: [{ IPv4: settings }] },
      };
    }
    case "ip-table": {
      const ipId = text(v.ipId, "IP ID").toUpperCase();
      if (
        !/^[0-9A-F]{2}$/.test(ipId) ||
        parseInt(ipId, 16) < 3 ||
        ipId === "FF"
      )
        throw new Error("IP ID must be hexadecimal 03–FE.");
      return {
        object: "IpTable",
        patch: {
          [choice(v.action, ["AddEntries", "RemoveEntries"])]: [
            {
              Address: host(v.address),
              IpId: ipId,
              ...(v.program ?
                { ProgramInstanceId: String(integer(v.program, 1, 10)) }
              : {}),
            },
          ],
        },
      };
    }
    case "background": {
      if (!bool(v.enabled))
        return {
          object: "BackgroundImage",
          patch: { Outputs: { Output1: { IsEnabled: false } } },
        };
      const source = choice(v.source, ["Local", "Remote"]);
      const output: JsonObject = {
        IsEnabled: true,
        HostBackgroundImage: source,
        ImageDisplayMode: ["Maintain", "Stretch", "OneToOne"].indexOf(
          choice(v.mode, ["Maintain", "Stretch", "OneToOne"]),
        ),
        DisplayWaitTimeInSeconds: integer(v.wait, 0, 86400),
      };
      if (source === "Local")
        output.Local = { ImageName: text(v.name, "image name") };
      else {
        const url = new URL(text(v.url, "image URL"));
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error(
            "Use an HTTP(S) image URL without embedded credentials.",
          );
        output.RemoteServer = {
          ServerPath: url.toString(),
          IsRefreshImageEnabled: bool(v.refresh),
          RefreshRateInMinutes: integer(v.minutes, 1, 10080),
        };
      }
      return {
        object: "BackgroundImage",
        patch: { Outputs: { Output1: output } },
      };
    }
    case "background-delete":
      return {
        object: "ImageMgmnt",
        patch: { LocalImages: { [slot(v.slot)]: {} } },
      };
    case "certificate-delete":
      return {
        object: "CertificateStore",
        patch: {
          [store(v.store)]: {
            RemoveCertificate: {
              Name: text(v.name, "certificate name"),
              Uuid: text(v.uuid, "certificate UUID"),
            },
          },
        },
      };
    case "password":
      return {
        object: "Authentication",
        patch: {
          CurrentUser: {
            Name: text(v.username, "user name"),
            Password: text(v.password, "new password"),
            CurrentPassword: text(v.currentPassword, "current password"),
          },
        },
      };
    default:
      throw new Error("Unknown NVX administration command.");
  }
}

export function nvxUploadRequest(
  id: string,
  v: Record<string, unknown>,
): NvxUpload {
  const name = text(v.name, "filename"),
    base64 = textBase64(v.base64);
  if (!/^[^\\/\x00-\x1f"<>:|?*]{1,160}$/.test(name))
    throw new Error("Use a filename without a path.");
  if (id === "background-upload") {
    if (!/\.(png|jpe?g)$/i.test(name))
      throw new Error("Choose a JPEG or PNG image.");
    const path = "/data/web/tmp/Images/Local";
    return {
      object: "ImageMgmnt",
      path: "/Device",
      field: "UploadImage",
      name,
      base64,
      mime: /\.png$/i.test(name) ? "image/png" : "image/jpeg",
      fields: {
        UploadFilePath: path,
        RequestPayload: JSON.stringify({
          Device: {
            ImageMgmnt: {
              LocalImages: {
                [slot(v.slot)]: { UploadFile: name, UploadFilePath: path },
              },
            },
          },
        }),
      },
    };
  }
  if (id === "certificate-upload") {
    const kind = store(v.store);
    if (!/\.(cer|crt|pem|der|pfx|p12)$/i.test(name))
      throw new Error("Choose a certificate or PKCS#12 file.");
    return {
      object: "CertificateStore",
      path: `/Device/CertificateStore/${kind}/AddCertificate`,
      field: "Name",
      name,
      base64,
      mime:
        /\.(pfx|p12)$/i.test(name) ?
          "application/x-pkcs12"
        : "application/x-x509-ca-cert",
      fields:
        ["Machine", "WebServer"].includes(kind) ?
          { Password: text(v.password ?? "", "certificate password", true) }
        : {},
    };
  }
  throw new Error("Unknown NVX upload type.");
}
function textBase64(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 5592408 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("Choose a file no larger than 4 MiB.");
  const size =
    (value.length / 4) * 3 -
    (value.endsWith("==") ? 2
    : value.endsWith("=") ? 1
    : 0);
  if (size > 4 * 1024 * 1024) throw new Error("File exceeds 4 MiB.");
  return value;
}
export function redactNvxSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactNvxSecrets);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /password|passwd|secret|token|privatekey|base64/i.test(key) ?
          "[redacted]"
        : redactNvxSecrets(child),
      ]),
    );
  return value;
}
export function nvxSubscriptionEntryChange(
  values: Record<string, unknown>,
  current: unknown,
): NvxChange {
  assertJsonObject(current);
  const subscriptions = structuredClone(current);
  const key = text(values.key, "subscription UUID");
  if (
    !/^[A-Za-z0-9-]{1,128}$/.test(key) ||
    ["constructor", "prototype", "__proto__"].includes(key)
  )
    throw new Error("Invalid subscription UUID.");
  if (choice(values.action, ["Add or update", "Remove"]) === "Remove") {
    if (!Object.hasOwn(subscriptions, key))
      throw new Error("Subscription not found; read the current list.");
    delete subscriptions[key];
  } else {
    const rtsp = new URL(text(values.rtsp, "RTSP URL"));
    if (
      rtsp.protocol !== "rtsp:" ||
      rtsp.username ||
      rtsp.password ||
      rtsp.search
    )
      throw new Error(
        "Use an RTSP URL without credentials or query parameters.",
      );
    const multicast = ipv4(values.multicast);
    if (
      Number(multicast.split(".")[0]) < 224 ||
      Number(multicast.split(".")[0]) > 239
    )
      throw new Error("Enter a multicast IPv4 address.");
    subscriptions[key] = {
      Address: `https://${host(values.address)}/onvif/services`,
      UniqueId: key,
      InputName: text(values.name, "input name"),
      SessionName: text(values.name, "session name"),
      Position: integer(values.position, 1, 1000),
      RtspUri: rtsp.toString(),
      MulticastAddress: multicast,
    };
  }
  return { object: "XioSubscription", patch: { Subscriptions: subscriptions } };
}

export function nvxSubscriptionsFromXml(xml: string): JsonObject {
  if (
    xml.length > 131072 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error(
      "Invalid subscription XML (maximum 128 KiB; no DTD/entities).",
    );
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
  }).parse(xml);
  const subscriptions = parsed?.Device?.XioSubscription?.Subscriptions;
  if (subscriptions === "") return {};
  assertJsonObject(subscriptions);
  const result = Object.fromEntries(
    Object.entries(subscriptions).map(([key, value]) => [
      key.startsWith("Unique-") ? key.slice(7) : key,
      value,
    ]),
  );
  assertJsonObject(result);
  for (const entry of Object.values(result)) {
    assertJsonObject(entry);
    for (const key of ["AudioChannels", "Bitrate", "Fps", "Position"])
      if (key in entry) entry[key] = integer(entry[key], 0, 2147483647);
    for (const key of ["Encryption", "IsSyncDetected"])
      if (key in entry) entry[key] = bool(entry[key]);
  }
  if (Object.keys(result).length !== Object.keys(subscriptions).length)
    throw new Error("Duplicate subscription identifiers.");
  return result;
}
export function nvxSubscriptionsToXml(subscriptions: JsonObject): string {
  assertJsonObject(subscriptions);
  const renamed = Object.fromEntries(
    Object.entries(subscriptions).map(([key, value]) => {
      if (!/^[A-Za-z0-9_-]+$/.test(key))
        throw new Error(
          "Subscription ID cannot be represented in desktop XML.",
        );
      return [`Unique-${key}`, value];
    }),
  );
  return new XMLBuilder({ format: true, ignoreAttributes: true }).build({
    Device: { XioSubscription: { Subscriptions: renamed } },
  });
}
