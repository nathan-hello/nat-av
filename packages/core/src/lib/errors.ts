export namespace Err {
  // prettier-ignore
  export const Codes = {
    RpcInvalidRequestObject:        -32600,
    RpcMethodNotFound:              -32601,
    RpcInvalidParams:               -32602,
    DriverNotFound:                 -32001,
    DriverMethodNotFound:           -32002,
    DriverCallFailed:               -32003,
    RequestTimeout:                 -35000,
    RequestsShutdown:               -35001,
    RpcTimeout:                     -32004,
    RpcDisconnected:                -32005,
    CtxNotFound:                    -36001,
    ManagerFoundMultipleNames:      -37001,
    JsonStringifyFailed:            -38001,
  } as const;
}
