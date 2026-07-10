import type { Schema } from "@drivers/natav/schema/types";

type BuiltinApi = {
  inspect: () => {
    channels: Map<number, { name: string }>;
    labels: Set<string>;
    payload: Uint8Array;
    createdAt: Date;
  };
};

const schema: Schema.ApiNode<"inspect", BuiltinApi["inspect"]> = {
  name: "inspect",
  returns: {
    type: "object",
    properties: {
      channels: {
        type: "map",
        keys: { type: "number" },
        values: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
      labels: {
        type: "set",
        items: { type: "string" },
      },
      payload: { type: "bytes" },
      createdAt: { type: "date" },
    },
  },
  args: [],
} as const;

export default schema;
