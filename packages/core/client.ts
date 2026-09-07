import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "./telemetry/index.js";

import * as TelemetryExportersMod from "./telemetry/exporters.js";
import * as TelemetrySdkMod from "./telemetry/sdk.js";
import * as TelemetryTypesMod from "./telemetry/types.js";

export type { Tcp } from "./sockets/tcp.js";
export type { Udp } from "./sockets/udp.js";

export type { Natav } from "./drivers/index.js";
export { Err } from "./lib/errors.js";
export { TypedEventTarget } from "./lib/eventtarget.js";
export type { RequestManager } from "./lib/requests.js";
export type { Delimiters } from "./sockets/delimiters.js";
export type { Test } from "./test/data.test.js";
export type { Events, Sockets } from "./types/index.js";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
}

export type { ClientRpcTransport } from "./rpc/client/websocket.js";
export type { Rpc } from "./rpc/types.js";
export { RpcClient } from "./rpc/client/index.js";
export type { ServerRpcTransport, ServerRpcTransportEvents, } from "./rpc/server/transport.js";
