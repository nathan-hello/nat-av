import { TypedEventTarget } from "@av/lib/eventtarget";
import type { Events } from "@av/types";

export class Bus extends TypedEventTarget<Events.System.Map> {}

export const bus = new Bus();
