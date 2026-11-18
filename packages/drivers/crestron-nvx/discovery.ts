import {
  nvxObjects,
  nvxWriteOnlyObjects,
  reportedControls,
  type JsonObject,
  type NvxControl,
  type NvxObject,
  type NvxOptionGroups,
  type NvxSnapshot,
} from "./catalog.js";
import { profiles } from "./generated.js";

export type NvxModel = keyof typeof profiles;
/** What Crestron's SDK documentation says a model can do (see scripts/generate.py). */
export type NvxProfile = {
  model: NvxModel;
  families: readonly string[];
  hdmiInputs: number;
  usbCInputs: number;
  audioSources: readonly string[];
  dante: boolean;
  /** SDK members whose support differs between NVX models. */
  features: readonly string[];
};

/**
 * REST objects that exist only on models whose SDK profile has the feature.
 * Firmware is shared across families, so a 360 may still answer for Dante;
 * the SDK profile decides whether that object is meaningful for the model.
 */
export const nvxFeatureObjects = {
  Dante: { feature: "Dante", label: "Dante audio" },
  MultiViewLayout: { feature: "MultiviewControlsSetup", label: "Multiview" },
  Preview: { feature: "PreviewImage", label: "Video preview" },
  TestPatternConfig: {
    feature: "TestPatternGenerator",
    label: "Test patterns",
  },
} as const satisfies Partial<
  Record<NvxObject, { feature: string; label: string }>
>;

export type NvxDiscovery = {
  model: string;
  firmware: string;
  /** Missing when the SDK documentation does not describe this model. */
  profile?: NvxProfile;
  /** Objects reported by the device and allowed by its profile. */
  objects: NvxObject[];
  /** Objects the device did not report. */
  unsupported: NvxObject[];
  /** Objects skipped because the model's SDK profile lacks the feature. */
  withheld: { object: NvxObject; feature: string; label: string }[];
  inputs: { hdmi: number; usbC: number };
  /** Controls whose paths this device reported, narrowed to its values. */
  controls: NvxControl[];
  discoveredAt: string;
};

export function nvxProfile(model: unknown): NvxProfile | undefined {
  if (typeof model !== "string") return undefined;
  const key = Object.keys(profiles).find(
    (entry) => entry === model.trim().toUpperCase(),
  );
  if (!key) return undefined;
  // TSAS: key came from Object.keys(profiles), so it is a profile name.
  const name = key as NvxModel;
  return { model: name, ...profiles[name] };
}

/** True unless the SDK profile documents that the model lacks this object. */
export function nvxProfileAllows(
  profile: NvxProfile | undefined,
  object: NvxObject,
): boolean {
  if (!profile || !Object.hasOwn(nvxFeatureObjects, object)) return true;
  // TSAS: hasOwn above proves object is one of nvxFeatureObjects' keys.
  const gate = nvxFeatureObjects[object as keyof typeof nvxFeatureObjects];
  return gate.feature === "Dante"
    ? profile.dante
    : profile.features.includes(gate.feature);
}

/** Objects discover() reads. Write-only objects are assumed, not probed. */
export function nvxProbeObjects(): NvxObject[] {
  return nvxObjects.filter(
    (name) => name !== "DeviceInfo" && !nvxWriteOnlyObjects.includes(name),
  );
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Build the discovery result from objects read during one discover(). */
export function nvxDiscovery(
  snapshot: NvxSnapshot,
  unsupported: NvxObject[],
  optionGroups: NvxOptionGroups = {},
): NvxDiscovery {
  const info: JsonObject = snapshot.objects.DeviceInfo ?? {};
  const profile = nvxProfile(info.Model);
  const ports: JsonObject = (() => {
    const config = snapshot.objects.DeviceCapabilities?.PortConfig;
    return config && typeof config === "object" && !Array.isArray(config)
      ? config
      : {};
  })();
  const inputs = {
    hdmi: count(ports.NumberOfHdmiInputs) ?? profile?.hdmiInputs ?? 1,
    usbC: count(ports.NumberOfUsbCInputs) ?? profile?.usbCInputs ?? 0,
  };
  const withheld = nvxProbeObjects()
    .filter((name) => !nvxProfileAllows(profile, name))
    .map((name) => {
      // TSAS: nvxProfileAllows only rejects keys of nvxFeatureObjects.
      const gate = nvxFeatureObjects[name as keyof typeof nvxFeatureObjects];
      return { object: name, feature: gate.feature, label: gate.label };
    });
  const objects = nvxObjects.filter(
    (name) =>
      nvxProfileAllows(profile, name) &&
      (nvxWriteOnlyObjects.includes(name) ||
        (snapshot.objects[name] !== undefined && !unsupported.includes(name))),
  );
  const context = {
    ...(profile ? { audioSources: profile.audioSources } : {}),
    inputs: inputs.hdmi + inputs.usbC,
  };
  return {
    model: typeof info.Model === "string" ? info.Model : "",
    firmware:
      typeof info.DeviceVersion === "string"
        ? info.DeviceVersion
        : typeof info.PufVersion === "string"
          ? info.PufVersion
          : "",
    ...(profile ? { profile } : {}),
    objects,
    unsupported,
    withheld,
    inputs,
    controls: objects.flatMap((name) =>
      reportedControls(
        name,
        snapshot.objects[name] ?? {},
        optionGroups,
        context,
      ),
    ),
    discoveredAt: new Date().toISOString(),
  };
}
