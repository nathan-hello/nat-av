import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schema } from "./data.ts";

describe("test schema", () => {
  it("generates jsonrpc bindings for the test natav", async () => {
    let payload = await schema.response().json();

    assert.equal(payload.version, 1);
    assert.equal(payload.format, "natav-jsonrpc-bindings");
    assert.deepEqual(payload.entry, {
      filePath: "/home/nate/code/nat-av/av/test/data.ts",
      exportName: "natav",
    });
    assert.deepEqual(payload.roots, ["shim-1"]);
    assert.deepEqual(payload.transport, {
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
          params: { device: "device instance name" },
        },
      },
      notifications: {
        state: { method: "notification", type: "natav:state:update" },
        connected: { method: "notification", type: "natav:device:connected" },
        disconnected: { method: "notification", type: "natav:device:disconnected" },
      },
    });

    assert.deepEqual(payload.devices["shim-1"], {
      name: "shim-1",
      driverName: "test-shim",
      typeName: "TestShim",
      source: { filePath: "/home/nate/code/nat-av/av/test/data.ts", symbolName: "TestShim" },
      deps: [],
      state: {
        kind: "object",
        name: "TestShimState",
        properties: {
          connected: {
            readonly: false,
            required: true,
            type: { kind: "primitive", type: "boolean" },
          },
          lastFrame: {
            readonly: false,
            required: true,
            type: {
              kind: "union",
              members: [
                { kind: "primitive", type: "null" },
                { kind: "primitive", type: "string" },
              ],
            },
          },
        },
      },
      methods: {
        ping: { params: [], returns: { kind: "primitive", type: "string" } },
        send: {
          params: [
            { name: "message", required: true, type: { kind: "primitive", type: "string" } },
          ],
          returns: { kind: "primitive", type: "number" },
        },
      },
      socket: {
        typeName: "Tcp",
        source: { filePath: "/home/nate/code/nat-av/av/sockets/tcp.ts", symbolName: "Tcp" },
        properties: {
          name: {
            readonly: false,
            required: true,
            type: { kind: "primitive", type: "string" },
          },
        },
        methods: {
          write: {
            params: [
              {
                name: "data",
                required: true,
                type: {
                  kind: "union",
                  members: [
                    { kind: "primitive", type: "string" },
                    { kind: "reference", name: "Uint8Array" },
                    { kind: "reference", name: "Buffer" },
                  ],
                },
              },
            ],
            returns: { kind: "primitive", type: "number" },
          },
          start: { params: [], returns: { kind: "reference", name: "void" } },
          end: { params: [], returns: { kind: "reference", name: "void" } },
          on: {
            params: [
              { name: "type", required: true, type: { kind: "reference", name: "K" } },
              {
                name: "handler",
                required: true,
                type: { kind: "reference", name: "Function" },
              },
              {
                name: "options",
                required: false,
                type: {
                  kind: "union",
                  members: [
                    { kind: "literal", value: false },
                    { kind: "literal", value: true },
                    {
                      kind: "object",
                      name: "AddEventListenerOptions",
                      properties: {
                        once: {
                          readonly: false,
                          required: false,
                          type: { kind: "primitive", type: "boolean" },
                        },
                        passive: {
                          readonly: false,
                          required: false,
                          type: { kind: "primitive", type: "boolean" },
                        },
                        signal: {
                          readonly: false,
                          required: false,
                          type: { kind: "reference", name: "AbortSignal" },
                        },
                        capture: {
                          readonly: false,
                          required: false,
                          type: { kind: "primitive", type: "boolean" },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            returns: {
              kind: "object",
              name: "Tcp",
              properties: {
                name: {
                  readonly: false,
                  required: true,
                  type: { kind: "primitive", type: "string" },
                },
              },
            },
          },
          once: {
            params: [
              { name: "type", required: true, type: { kind: "reference", name: "K" } },
              {
                name: "options",
                required: false,
                type: {
                  kind: "object",
                  properties: {
                    signal: {
                      readonly: false,
                      required: false,
                      type: { kind: "reference", name: "AbortSignal" },
                    },
                  },
                },
              },
            ],
            returns: { kind: "unknown" },
          },
        },
        events: {
          connected: { kind: "reference", name: "void" },
          disconnected: {
            kind: "object",
            properties: {
              error: {
                readonly: false,
                required: true,
                type: { kind: "primitive", type: "string" },
              },
            },
          },
          receive: { kind: "reference", name: "Buffer" },
          error: {
            kind: "object",
            properties: {
              error: {
                readonly: false,
                required: true,
                type: { kind: "primitive", type: "string" },
              },
              code: {
                readonly: false,
                required: false,
                type: {
                  kind: "union",
                  members: [
                    { kind: "primitive", type: "string" },
                    { kind: "primitive", type: "number" },
                  ],
                },
              },
            },
          },
          retryScheduled: {
            kind: "object",
            properties: {
              delay: {
                readonly: false,
                required: true,
                type: { kind: "primitive", type: "number" },
              },
            },
          },
          timeout: { kind: "reference", name: "void" },
          transmit: {
            kind: "object",
            properties: {
              bytesWritten: {
                readonly: false,
                required: true,
                type: { kind: "primitive", type: "number" },
              },
            },
          },
        },
      },
    });
  });
});
