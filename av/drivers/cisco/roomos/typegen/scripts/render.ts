import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  groupCommandEntriesByProductSet,
  hasMultiplicity,
  isLiteralWithoutValues,
  isTruthyFlag,
  mergeEntries,
  removeBrackets,
  uniqueKinds,
  uniqueProducts,
  valueType,
} from "./parse.ts";

import type {
  CommandTreeNode,
  Param,
  ReducedEntry,
  ReducedEventNode,
  ReducedParam,
  ReducedValuespace,
  SchemaEntry,
  SchemaJson,
} from "./types.ts";

function indent(text: string, depth = 1): string {
  const prefix = "  ".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

function escapeComment(value: string): string {
  return value.replaceAll("*/", "* /");
}

function emitDoc(lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `/**\n${lines.map((line) => ` * ${escapeComment(line)}`).join("\n")}\n */\n`;
}

function formatEntryDoc(entry: SchemaEntry): string {
  const docs: string[] = [
    `Path: ${JSON.stringify(entry.path)}`,
    `Type: ${entry.type}`,
  ];

  if (entry.normPath !== undefined) {
    docs.push(`NormPath: ${JSON.stringify(entry.normPath)}`);
  }

  if (entry.attributes.description) {
    docs.push(`Description: ${entry.attributes.description}`);
  }

  if (entry.attributes.access) {
    docs.push(`Access: ${entry.attributes.access}`);
  }

  if (entry.attributes.backend) {
    docs.push(`Backend: ${entry.attributes.backend}`);
  }

  if (entry.attributes.role?.length) {
    docs.push(`Roles: ${JSON.stringify(entry.attributes.role)}`);
  }

  if (entry.attributes.privacyimpact) {
    docs.push(`Privacyimpact: ${entry.attributes.privacyimpact}`);
  }

  if (entry.attributes.state_dependent) {
    docs.push(`StateDependent: ${entry.attributes.state_dependent}`);
  }

  if (entry.attributes.unavailableStates) {
    docs.push(`UnavailableStates: ${entry.attributes.unavailableStates}`);
  }

  if (hasMultiplicity(entry.attributes.multiline)) {
    docs.push("Multiline: true");
  }

  return emitDoc(docs);
}

function formatParamDoc(path: string, param: Param): string {
  const docs: string[] = [];

  if (isLiteralWithoutValues(param.valuespace)) {
    docs.push(`Cisco schema does not specify a type for ${path} ${param.name}`);
  }

  if (param.description) {
    docs.push(`Description: ${param.description}`);
  }

  if (param.required !== undefined) {
    docs.push(`Required: ${JSON.stringify(param.required)}`);
  }

  if (param.default !== undefined) {
    docs.push(`Default: ${JSON.stringify(param.default)}`);
  }

  if (typeof param.valuespace !== "string") {
    if (param.valuespace.Min !== undefined) {
      docs.push(`Min: ${JSON.stringify(param.valuespace.Min)}`);
    }

    if (param.valuespace.Max !== undefined) {
      docs.push(`Max: ${JSON.stringify(param.valuespace.Max)}`);
    }

    if (param.valuespace.Step !== undefined) {
      docs.push(`Step: ${JSON.stringify(param.valuespace.Step)}`);
    }

    if (param.valuespace.MinLength !== undefined) {
      docs.push(`MinLength: ${JSON.stringify(param.valuespace.MinLength)}`);
    }

    if (param.valuespace.MaxLength !== undefined) {
      docs.push(`MaxLength: ${JSON.stringify(param.valuespace.MaxLength)}`);
    }

    if (param.valuespace.Values?.length) {
      docs.push(`Values: ${JSON.stringify(param.valuespace.Values)}`);
    }

    if (param.valuespace.multiple !== undefined) {
      docs.push(`Multiple: ${JSON.stringify(param.valuespace.multiple)}`);
    }
  }

  return emitDoc(docs);
}

function formatMissingTypeDoc(path: string): string {
  return emitDoc([`Cisco schema does not specify a type for ${path}`]);
}



function renderObject(fields: readonly string[], depth: number): string {
  if (!fields.length) {
    return "{}";
  }

  return `{
${fields.map((field) => indent(field, depth + 1)).join("\n")}
${indent("}", depth)}`;
}

function renderTuple(
  items: readonly string[],
  depth: number,
  multiline = false,
): string {
  if (!items.length) {
    return "readonly []";
  }

  if (!multiline) {
    return `readonly [${items.join(", ")}]`;
  }

  if (items.length === 1) {
    return `readonly [\n${indent(items[0], depth + 1)}\n${indent("]", depth)}`;
  }

  return `readonly [\n${items.map((item) => indent(`${item},`, depth + 1)).join("\n")}\n${indent("]", depth)}`;
}

export const render = {
  object: renderObject,
  tuple: renderTuple,
  doc: {
    entry: formatEntryDoc,
    param: formatParamDoc,
    missing: formatMissingTypeDoc,
  },
}
