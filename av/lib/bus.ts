import { TypedEventTarget } from "@av/lib/eventtarget";
import type { Events, Natav } from "@av/types";

export class Bus<T extends Natav.Orch> extends TypedEventTarget<
  Events.System.Map<T>
> {}

export const bus = new Bus();
