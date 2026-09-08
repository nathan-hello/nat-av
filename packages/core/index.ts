import {
  Telemetry as BaseTelemetry,
  type TelemetryLogSchema as BaseTelemetryLogSchema,
} from "./telemetry/index.js";
import * as TelemetryExportersMod from "./telemetry/exporters.js";
import * as TelemetrySdkMod from "./telemetry/sdk.js";
import * as TelemetryServerExportersMod from "./telemetry/server/exporters.js";
import * as TelemetryTypesMod from "./telemetry/types.js";

export { Convert } from "./lib/convert.js";
export * as Proto from "./protocol/index.js";
export { Tcp } from "./sockets/tcp.js";
export { Udp } from "./sockets/udp.js";

export { Natav } from "./drivers/index.js";
export { Err } from "./lib/errors.js";
export { TypedEventTarget } from "./lib/eventtarget.js";
export { RequestManager } from "./lib/requests.js";
export { Delimiters } from "./sockets/delimiters.js";
export { Test } from "./test/data.test.js";
export type { Events, Sockets } from "./types/index.js";

export type { ClientRpcTransport, Rpc } from "./rpc/index.js";
export { RpcClient, RpcServer } from "./rpc/index.js";
export type {
  ServerRpcTransport,
  ServerRpcTransportEvents,
} from "./rpc/server/transport.js";

export class Telemetry<
  T extends BaseTelemetryLogSchema = BaseTelemetryLogSchema,
> extends BaseTelemetry<T> {}

export namespace Telemetry {
  export import Types = TelemetryTypesMod;
  export import Exporters = TelemetryExportersMod;
  export import Sdk = TelemetrySdkMod;
  export import Server = TelemetryServerExportersMod;
}

export * as Repl from "./tools/repl/index.js";
