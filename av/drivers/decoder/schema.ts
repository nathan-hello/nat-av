import type { Schema, SchemaMap } from "@av/types";
import type * as T from "@av/drivers/decoder/types";
import type Decoder from "@av/drivers/decoder";

export const SchemaAudioRoute: SchemaMap<T.AudioRoute>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "window", value: { type: "number" } },
    { name: "uri", value: { type: "string" } },
  ],
};

export const SchemaAudioRouteArray: SchemaMap<T.AudioRoute[]>["array"] = {
  type: "array",
  items: [SchemaAudioRoute],
};

export const SchemaVideoRoute: SchemaMap<T.VideoRoute>["object"] = {
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

export const SchemaVideoRouteArray: SchemaMap<T.VideoRoute[]>["array"] = {
  type: "array",
  items: [SchemaVideoRoute],
};

export const SchemaMoveWindowArgs: SchemaMap<T.MoveWindowArgs>["object"] = {
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

export const SchemaRouteDestroyParams: SchemaMap<T.RouteDestroyRequest["params"]>["object"] = {
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

export const SchemaVideoOutputContext: SchemaMap<T.DecoderContext["video"][number]>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "type", value: { type: "string" } },
    { name: "height", value: { type: "number" } },
    { name: "width", value: { type: "number" } },
  ],
};

export const SchemaAudioOutputContext: SchemaMap<T.DecoderContext["audio"][number]>["object"] = {
  type: "object",
  fields: [
    { name: "output", value: { type: "number" } },
    { name: "type", value: { type: "string" } },
  ],
};

export const SchemaDecoderContext: SchemaMap<T.DecoderContext>["object"] = {
  type: "object",
  fields: [
    { name: "video", value: { type: "array", items: [SchemaVideoOutputContext] } },
    { name: "audio", value: { type: "array", items: [SchemaAudioOutputContext] } },
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

export const DecoderSchema = (): Schema<Decoder["api"]> => [
  {
    name: "fetchRoutes",
    args: [],
    returns: VideoAndAudioReturn,
  },
  { name: "debug", args: [{ type: "boolean", optional: true }], returns: { type: "number" } },
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
  { name: "moveRelative", args: [SchemaMoveWindowArgs], returns: { type: "number" } },
  { name: "moveAbsolute", args: [SchemaMoveWindowArgs], returns: { type: "number" } },
  { name: "fetchContext", args: [], returns: SchemaDecoderContext },
];
