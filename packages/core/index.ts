import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@nat-av/core/telemetry";
import * as TelemetryExportersMod from "@nat-av/core/telemetry/exporters";
import * as TelemetrySdkMod from "@nat-av/core/telemetry/sdk";
import * as TelemetryServerExportersMod from "@nat-av/core/telemetry/server/exporters";
import * as TelemetryTypesMod from "@nat-av/core/telemetry/types";

export { Convert } from "@nat-av/core/lib/convert";
export * as Proto from "@nat-av/core/protocol";
export { Tcp } from "@nat-av/core/sockets/tcp";
export { Udp } from "@nat-av/core/sockets/udp";

export { Driver, Manager } from "@nat-av/core/drivers";
export { Err } from "@nat-av/core/lib/errors";
export { TypedEventTarget } from "@nat-av/core/lib/eventtarget";
export { RequestManager } from "@nat-av/core/lib/requests";
export { Delimiters } from "@nat-av/core/sockets/delimiters";
export { Test } from "@nat-av/core/test/data.test";
export type { Drivers, Events, Sockets } from "@nat-av/core/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
  export import Server = TelemetryServerExportersMod;
}
