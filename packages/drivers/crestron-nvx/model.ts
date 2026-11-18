import type { NvxDriver } from "./nvx.js";
import { profiles } from "./generated.js";

export type NvxModel = keyof typeof profiles;
type Profile<M extends NvxModel> = (typeof profiles)[M];
type DanteSettings = {
  setName(port: string, name: string): Promise<void>;
  setSource(port: string, source: string): Promise<void>;
};
type ModelApi<M extends NvxModel> = {
  setAudioSource(source: Profile<M>["audioSources"][number]): Promise<void>;
} & (Profile<M>["dante"] extends true ? { dante: DanteSettings } : {});

/** Bind a typed control surface only after verifying the authenticated endpoint. */
export async function forNvxModel<const M extends NvxModel>(
  driver: NvxDriver, model: M,
): Promise<ModelApi<M>> {
  const info = (await driver.api.refresh("DeviceInfo")).objects.DeviceInfo;
  if (info?.Model !== model) throw new Error(`Expected ${model}, received ${info?.Model}.`);
  const profile = profiles[model];
  const sources: readonly string[] = profile.audioSources;
  const api = {
    setAudioSource(source: string) {
      if (!sources.includes(source)) throw new Error(`Unsupported audio source for ${model}.`);
      return driver.api.control("audio", source);
    },
    ...(profile.dante ? { dante: {
      setName: (port: string, name: string) => driver.api.control(`dante.${port}.name`, name),
      setSource: (port: string, source: string) => driver.api.control(`dante.${port}.source`, source),
    } } : {}),
  };
  // TSAS: The same generated model profile controls the runtime branch and conditional return type.
  return api as ModelApi<M>;
}
