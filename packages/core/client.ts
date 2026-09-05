import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@nat-av/core/telemetry";

import * as TelemetryExportersMod from "@nat-av/core/telemetry/exporters";
import * as TelemetrySdkMod from "@nat-av/core/telemetry/sdk";
import * as TelemetryTypesMod from "@nat-av/core/telemetry/types";

export type { Tcp } from "@nat-av/core/sockets/tcp";
export type { Udp } from "@nat-av/core/sockets/udp";

export type { Driver, Manager } from "@nat-av/core/drivers";
export { Err } from "@nat-av/core/lib/errors";
export { TypedEventTarget } from "@nat-av/core/lib/eventtarget";
export type { RequestManager } from "@nat-av/core/lib/requests";
export type { Delimiters } from "@nat-av/core/sockets/delimiters";
export type { Test } from "@nat-av/core/test/data.test";
export type { Drivers, Events, Sockets } from "@nat-av/core/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
}
