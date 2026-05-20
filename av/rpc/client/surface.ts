import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { SystemStateData } from "@av/system";

export type ClientRpcDeviceHandle<N extends Natav = natav, Name extends Natav.Names<N> = Natav.Names<N>> = {
  readonly api: Natav.Handle<N, Name>["api"];
  readonly state: Natav.State<N, Name> | undefined;
};

export type ClientRpcSurface<N extends Natav = natav> = {
  readonly deviceStates: Partial<{ [K in Natav.Names<N>]: Natav.State<N, K> }>;
  readonly systemStateData: SystemStateData;
  readonly isOnline: boolean;
  device<Name extends Natav.Names<N>>(name: Name): ClientRpcDeviceHandle<N, Name>;
};
