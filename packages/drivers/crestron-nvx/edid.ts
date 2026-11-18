import type { NvxChange, NvxSnapshot } from "./catalog.js";

export type EdidType = "System" | "Custom" | "Auto";
export type EdidEntry = {
  key: string;
  name: string;
  type: EdidType;
  fileName?: string;
  appliedPortsMask?: number;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    // TSAS: The guard excludes null, arrays and primitives before indexing JSON.
    ? (value as Record<string, unknown>)
    : {};
export function nvxEdidLibrary(snapshot: NvxSnapshot, input = 0): EdidEntry[] {
  const management = snapshot.objects.EdidMgmnt;
  if (management)
    return (
      [
        ["SystemEdidList", "System"],
        ["CustomEdidList", "Custom"],
        ["CopyEdidList", "Auto"],
      ] as const
    ).flatMap(([collection, type]) =>
      Object.entries(object(management[collection])).flatMap(([key, value]) => {
        const entry = object(value);
        return typeof entry.Name === "string"
          ? [
              {
                key,
                type,
                name: entry.Name,
                ...(typeof entry.FileName === "string"
                  ? { fileName: entry.FileName }
                  : {}),
                ...(typeof entry.AppliedPortsMask === "number"
                  ? { appliedPortsMask: entry.AppliedPortsMask }
                  : {}),
              },
            ]
          : [];
      }),
    );
  const inputs = snapshot.objects.AudioVideoInputOutput?.Inputs;
  const ports = object(Array.isArray(inputs) ? inputs[input] : undefined).Ports;
  const list = object(
    object(Array.isArray(ports) ? ports[0] : undefined).Edid,
  ).EdidList;
  return Array.isArray(list)
    ? list.flatMap((value) => {
        const entry = object(value);
        return typeof entry.Name === "string" &&
          (entry.Type === "System" || entry.Type === "Custom" || entry.Type === "Auto")
          ? [
              {
                key: entry.Name,
                name: entry.Name,
                type: entry.Type,
              },
            ]
          : [];
      })
    : [];
}
export function nvxCurrentEdid(snapshot: NvxSnapshot, input: number): string {
  const v2 = object(
    object(
      object(
        object(object(snapshot.objects.AvioV2?.Inputs)[`Input${input + 1}`])
          .InputInfo,
      ).Ports,
    ).Port1,
  ).CurrentEdid;
  if (typeof v2 === "string") return v2;
  const inputs = snapshot.objects.AudioVideoInputOutput?.Inputs;
  const ports = object(Array.isArray(inputs) ? inputs[input] : undefined).Ports;
  const current = object(
    object(Array.isArray(ports) ? ports[0] : undefined).Edid,
  ).CurrentEdid;
  return typeof current === "string"
    ? current
    : String(object(current).Name ?? "Not reported");
}
export function nvxDeleteEdidChange(key: string, legacy: boolean): NvxChange {
  if (
    !key ||
    key.length > 256 ||
    /[\x00-\x1f]/.test(key) ||
    ["__proto__", "constructor", "prototype"].includes(key)
  )
    throw new Error("Choose a custom EDID from the device library.");
  return legacy
    ? {
        object: "AudioVideoInputOutput",
        patch: {
          Inputs: [0, 1].map(() => ({
            Ports: [{ Edid: { DeleteEdid: { Name: key, Type: "Custom" } } }],
          })),
        },
      }
    : { object: "EdidMgmnt", patch: { CustomEdidList: { [key]: {} } } };
}
export function validateEdidUpload(name: string, base64: string) {
  if (
    !/^[^\\/\x00-\x1f"<>:|?*]{1,120}\.cedid$/i.test(name) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    ) ||
    !base64 ||
    base64.length > 43692
  )
    throw new Error("Choose a .cedid file no larger than 32 KiB.");
  const bytes =
    (base64.length / 4) * 3 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > 32768) throw new Error("EDID exceeds 32 KiB.");
  return bytes;
}
export function nvxEdidUploadRequest(name: string, legacy: boolean) {
  return legacy
    ? {
        path: "/Device/AudioVideoInputOutput/Inputs/0/Ports/Edid/",
        // TSAS: The legacy form has no fields but shares the upload descriptor type.
        fields: {} as Record<string, string>,
      }
    : {
        path: "/Device",
        fields: {
          UploadFilePath: "/data/web/tmp/edid/input0",
          RequestPayload: JSON.stringify({
            Device: {
              EdidMgmnt: {
                UploadFile: [name],
                UploadFilePath: "/data/web/tmp/edid/input0",
              },
            },
          }),
        },
      };
}
