import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@av/telemetry";
import * as TelemetryExportersMod from "@av/telemetry/exporters";
import * as TelemetryRuntimeMod from "@av/telemetry/runtime";
import * as TelemetrySdkMod from "@av/telemetry/sdk";
import * as TelemetryTypesMod from "@av/telemetry/types";

export { Driver, Manager } from "@av/drivers";
export { TypedEventTarget } from "@av/lib/eventtarget";
export { RequestManager } from "@av/lib/requests";
export { RpcClient } from "@av/rpc/client";
export { ClientRpcDevice as RpcDevice } from "@av/rpc/client/devices";
export { ClientWebsocket } from "@av/rpc/client/websocket";
export { Format, Rpc } from "@av/types";
export type { Drivers, Events, Requests, Schema, Sockets } from "@av/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Runtime = TelemetryRuntimeMod;
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
}
