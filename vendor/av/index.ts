import { RpcClient } from "@av/rpc/client";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { RpcServer } from "@av/rpc/server";
import { ServerTransportWebsocket } from "@av/rpc/server/websocket";
import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@av/telemetry";
import * as TelemetryExportersMod from "@av/telemetry/exporters";
import * as TelemetryRuntimeMod from "@av/telemetry/runtime";
import * as TelemetrySdkMod from "@av/telemetry/sdk";
import * as TelemetryServerExportersMod from "@av/telemetry/server/exporters";
import * as TelemetryTypesMod from "@av/telemetry/types";
export { Tcp } from "@av/sockets/tcp";
export { Udp } from "@av/sockets/udp";
export * as Proto from "@av/protocol";

export { Driver, Manager } from "@av/drivers";
export { TypedEventTarget } from "@av/lib/eventtarget";
export { RequestManager } from "@av/lib/requests";
export { Delimiters } from "@av/sockets/delimiters";
export { Test } from "@av/test/data.test";
export { Format, Rpc } from "@av/types";
export type { Drivers, Events, Requests, Sockets } from "@av/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Runtime = TelemetryRuntimeMod;
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
  export import Server = TelemetryServerExportersMod;
}

export const Client = {
  Rpc: RpcClient,
  Websocket: ClientWebsocket,
};

export const Server = {
  Rpc: RpcServer,
  Websocket: ServerTransportWebsocket,
};
