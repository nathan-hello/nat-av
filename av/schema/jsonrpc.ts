import type { NatavJsonRpcBindings, NatavSchema } from "./types.ts";

export function toJsonRpcBindings<T extends NatavSchema>(schema: T): NatavJsonRpcBindings {
  return {
    version: 1,
    format: "natav-jsonrpc-bindings",
    entry: schema.entry,
    roots: schema.roots,
    transport: {
      jsonrpc: "2.0",
      requests: {
        call: {
          method: "device.call",
          params: {
            device: "device instance name",
            method: "device api method name",
            args: "array of positional arguments",
          },
        },
        dependents: {
          method: "device.dependents",
          params: {
            device: "device instance name",
          },
        },
      },
      notifications: {
        state: {
          method: "notification",
          type: "natav:state:update",
        },
        connected: {
          method: "notification",
          type: "natav:device:connected",
        },
        disconnected: {
          method: "notification",
          type: "natav:device:disconnected",
        },
      },
    },
    devices: schema.devices,
  } as NatavJsonRpcBindings;
}

export function printJsonRpcBindings(schema: NatavSchema) {
  return JSON.stringify(toJsonRpcBindings(schema), null, 2);
}
