import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@av/telemetry";
import * as TelemetryExportersMod from "@av/telemetry/exporters";
import * as TelemetrySdkMod from "@av/telemetry/sdk";
import * as TelemetryServerExportersMod from "@av/telemetry/server/exporters";
import * as TelemetryTypesMod from "@av/telemetry/types";

export { Convert } from "@av/lib/convert";
export * as Proto from "@av/protocol";
export { Tcp } from "@av/sockets/tcp";
export { Udp } from "@av/sockets/udp";

export { Driver, Manager } from "@av/drivers";
export { Err } from "@av/lib/errors";
export { TypedEventTarget } from "@av/lib/eventtarget";
export { RequestManager } from "@av/lib/requests";
export { Delimiters } from "@av/sockets/delimiters";
export { Test } from "@av/test/data.test";
export type { Drivers, Events, Sockets } from "@av/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
  export import Server = TelemetryServerExportersMod;
}
