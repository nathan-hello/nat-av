export namespace Err {
  export const Codes = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
    DriverNotFound: -32001,
    DriverMethodNotFound: -32002,
    DriverCallFailed: -32003,
    RequestTimeout: -35000,
    RequestsShutdown: -35001,
    RpcTimeout: -32004,
    RpcDisconnected: -32005,
    CtxNotFound: -36001,
    ManagerFoundMultipleNames: -37001,
  } as const;
}
