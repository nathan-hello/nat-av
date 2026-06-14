import { TypedEventTarget } from "@av/lib/eventtarget";
import type { Drivers, Events } from "@av/types";

export class Bus<T extends Drivers.Array = Drivers.Array> extends TypedEventTarget<
  Events.Natav.Map<T>
> {}

