import type { Schema } from "@av/types";
import type DisplayManager from "@drivers/decoder/display";

const ArgResOffset = {
  type: "object",
  fields: [
    { name: "resX", value: { type: "number" } },
    { name: "resY", value: { type: "number" } },
    { name: "offsetX", value: { type: "number" } },
    { name: "offsetY", value: { type: "number" } },
  ],
} as const;

export const DisplaySchema: Schema.Schema<DisplayManager> = [
  {
    name: "move",
    returns: {
      type: "array",
      items: [{ type: "array", items: [{ type: "number" }] }],
    },
    args: [
      { type: "number" },
      ArgResOffset,
      { type: "number", optional: true },
    ],
  },
  {
    name: "route",
    args: [
      { type: "number" },
      { type: "string" },
      ArgResOffset,
      { type: "number", optional: true },
    ],
    returns: {
      type: "array",
      items: [{ type: "array", items: [{ type: "number" }] }],
    },
  },
  {
    name: "debug",
    args: [],
    returns: { type: "array", items: [{ type: "number" }] },
  },
  {
    name: "destroy",
    returns: { type: "array", items: [{ type: "number" }] },
    args: [
      {
        type: "union",
        anyOf: [{ type: "number" }, { type: "literal", value: "all" }],
      },
    ],
  },
  {
    name: "routeAudio",
    returns: { type: "number" },
    args: [
      { type: "string" },
      {
        type: "object",
        fields: [
          { name: "output", value: { type: "number" } },
          { name: "decoderIndex", value: { type: "number" } },
        ],
      },
    ],
  },
  {
    name: "changeTemplate",
    returns: { type: "literal", value: null },
    args: [
      {
        type: "object",
        fields: [
          { name: "name", value: { type: "string" } },
          { name: "type", value: { type: "literal", value: "builtin" } },
          { name: "id", value: { type: "number" } },
          {
            name: "regions",
            value: {
              type: "array",
              items: [
                {
                  type: "object",
                  fields: [
                    { name: "id", value: { type: "number" } },
                    { name: "row", value: { type: "number" } },
                    { name: "col", value: { type: "number" } },
                    { name: "width", value: { type: "number" } },
                    { name: "height", value: { type: "number" } },
                    {
                      name: "zIndex",
                      value: { type: "number", optional: true },
                    },
                  ],
                },
              ],
            },
          },
          {
            name: "dimensions",
            value: {
              type: "object",
              fields: [
                { name: "rows", value: { type: "number" } },
                { name: "cols", value: { type: "number" } },
              ],
            },
          },
        ],
      },
    ],
  },
];
