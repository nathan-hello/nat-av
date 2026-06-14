import type Decoder from "@av/drivers/decoder";
import type * as T from "@av/drivers/decoder/types";
import type { Schema } from "@av/types";

export const SchemaAudioRoute: Schema.Map<T.AudioRoute>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "window", value: { type: "number" } },
    { name: "uri", value: { type: "string" } },
  ],
};

export const SchemaAudioRouteArray: Schema.Map<T.AudioRoute[]>["array"] = {
  type: "array",
  items: [SchemaAudioRoute],
};

export const SchemaVideoRoute: Schema.Map<T.VideoRoute>["object"] = {
  type: "object",
  fields: [
    { name: "height", value: { type: "number" } },
    { name: "width", value: { type: "number" } },
    { name: "x", value: { type: "number" } },
    { name: "y", value: { type: "number" } },
    { name: "z", value: { type: "number" } },
    { name: "output", value: { type: "number" } },
    { name: "window", value: { type: "number" } },
    { name: "uri", value: { type: "string" } },
  ],
};

export const SchemaVideoRouteArray: Schema.Map<T.VideoRoute[]>["array"] = {
  type: "array",
  items: [SchemaVideoRoute],
};

export const SchemaMoveWindowArgs: Schema.Map<T.MoveWindowArgs>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "window", value: { type: "number" } },
    { name: "x", value: { type: "number", optional: true } },
    { name: "y", value: { type: "number", optional: true } },
    { name: "z", value: { type: "number", optional: true } },
    { name: "width", value: { type: "number", optional: true } },
    { name: "height", value: { type: "number", optional: true } },
  ],
};

export const SchemaRouteDestroyParams: Schema.Map<
  T.RouteDestroyRequest["params"]
>["object"] = {
  type: "object",
  fields: [
    {
      name: "video",
      value: {
        type: "array",
        items: [
          {
            type: "object",
            fields: [
              { name: "output", value: { type: "number" } },
              { name: "window", value: { type: "number" } },
            ],
          },
        ],
      },
    },
    {
      name: "audio",
      value: {
        type: "array",
        items: [
          {
            type: "object",
            fields: [{ name: "output", value: { type: "number" } }],
          },
        ],
      },
    },
  ],
};

export const SchemaVideoOutputContext: Schema.Map<
  T.DecoderContext["video"][number]
>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "type", value: { type: "string" } },
    { name: "height", value: { type: "number" } },
    { name: "width", value: { type: "number" } },
  ],
};

export const SchemaAudioOutputContext: Schema.Map<
  T.DecoderContext["audio"][number]
>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "type", value: { type: "string" } },
  ],
};

export const SchemaDecoderContext: Schema.Map<T.DecoderContext>["object"] = {
  type: "object",
  fields: [
    {
      name: "video",
      value: { type: "array", items: [SchemaVideoOutputContext] },
    },
    {
      name: "audio",
      value: { type: "array", items: [SchemaAudioOutputContext] },
    },
  ],
};

export const VideoAndAudioReturnOptional = {
  type: "object",
  fields: [
    { name: "video", value: { ...SchemaVideoRoute, optional: true } },
    { name: "audio", value: { ...SchemaAudioRoute, optional: true } },
  ],
} as const;

export const VideoAndAudioReturn = {
  type: "object",
  fields: [
    { name: "video", value: SchemaVideoRouteArray },
    { name: "audio", value: SchemaAudioRouteArray },
  ],
} as const;

export const DecoderSchema = (): Schema.Schema<Decoder> => [
  {
    name: "fetchRoutes",
    args: [],
    returns: VideoAndAudioReturn,
  },
  {
    name: "debug",
    args: [{ type: "boolean", optional: true }],
    returns: { type: "number" },
  },
  {
    name: "route",
    returns: { type: "number" },
    args: [VideoAndAudioReturnOptional],
  },
  {
    name: "unroute",
    returns: { type: "number" },
    args: [
      {
        type: "union",
        anyOf: [{ type: "literal", value: "all" }, SchemaRouteDestroyParams],
      },
    ],
  },
  {
    name: "moveRelative",
    args: [SchemaMoveWindowArgs],
    returns: { type: "number" },
  },
  {
    name: "moveAbsolute",
    args: [SchemaMoveWindowArgs],
    returns: { type: "number" },
  },
  { name: "fetchContext", args: [], returns: SchemaDecoderContext },
];
