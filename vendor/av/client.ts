import { RpcClient } from "@av/rpc/client";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import type { RpcServer } from "@av/rpc/server";
import type { ServerTransportWebsocket } from "@av/rpc/server/websocket";
import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "@av/telemetry";

import * as TelemetryExportersMod from "@av/telemetry/exporters";
import * as TelemetryRuntimeMod from "@av/telemetry/runtime";
import * as TelemetrySdkMod from "@av/telemetry/sdk";
import * as TelemetryTypesMod from "@av/telemetry/types";

export type { Tcp } from "@av/sockets/tcp";
export type { Udp } from "@av/sockets/udp";

export type { Driver, Manager } from "@av/drivers";
export { TypedEventTarget } from "@av/lib/eventtarget";
export type { RequestManager } from "@av/lib/requests";
export type { Delimiters } from "@av/sockets/delimiters";
export type { Test } from "@av/test/data.test";
export type {
  Drivers,
  Events,
  Requests,
  Rpc,
  Sockets,
} from "@av/types";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Runtime = TelemetryRuntimeMod;
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
}

export const Client = {
  Rpc: RpcClient,
  Websocket: ClientWebsocket,
};

export type Server = {
  Rpc: RpcServer;
  Websocket: ServerTransportWebsocket;
};
