import type { ReadableLogRecord } from "./tools/telemetry/types";
import { TypedEventTarget } from "./lib/eventtarget";
import type Natav from "./natav";
import type { natav } from "./index";

export type SystemEvents<N extends Natav = natav> =
  | {
      type: "natav:state:update";
      name: Natav.Names<N>;
      data: Partial<Natav.State<N, any>>;
    }
  | {
      type: "natav:state:override";
      name: Natav.Names<N>;
      data: Partial<Natav.State<N, any>>;
    }
  | { type: "natav:device:connected"; name: string }
  | { type: "natav:device:disconnected"; name: string }
  | { type: "natav:device:error"; name: string; error?: Error | unknown }
  | { type: "natav:opentelemetry:entry"; message: ReadableLogRecord }
  | {
      type: "natav:automation:triggered";
      name: string;
      trigger: { condition: string };
      action: { name: string; data: string };
    };

export type SystemEvent<T extends SystemEvents["type"]> = Extract<SystemEvents, { type: T }>;

export type SystemEventOfName<T extends SystemEvents["type"], Name extends string> = Extract<
  SystemEvents,
  { type: T; name: Name }
>;

export type EventName = SystemEvents["type"];
export type EventPayload<E extends EventName = EventName> = Extract<SystemEvents, { type: E }>;

export type EventHandler<E extends EventName = EventName> = (payload: EventPayload<E>) => void;

type EventMap = {
  [T in EventName]: EventPayload<T>;
};

export class Bus extends TypedEventTarget<EventMap> {}

export const bus = new Bus();
