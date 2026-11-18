import { Repl } from "@nat-av/core";
import { nvxObjects, type NvxObject, type JsonValue } from "../catalog.js";
import type NvxDriver from "../index.js";

const help = `info | caps | discover | objects | read <object> | controls <object>
streams                         Read TX, RX and discovered SDP streams
control <id> <value>            Set a catalog control (e.g. control leds true)
nax <Tx|Rx> <key> <action> [value]
    Actions: address, port, name (Tx), auto (true/false), start, stop
edids | subscriptions | connect | exit`;

function objectName(arg?: string): NvxObject {
  const name = nvxObjects.find(n => n.toLowerCase() === arg?.toLowerCase());
  if (!name) throw new Error("Use 'objects' for valid object names.");
  return name;
}

function scalar(text: string): JsonValue {
  if (text === "true" || text === "false") return text === "true";
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

export function createRepl({ driver }: { driver: NvxDriver }) {
  const api = driver.api;
  const print = (value: unknown) => JSON.stringify(value, null, 2);
  const read = async (name: NvxObject) => print((await api.refresh(name)).objects[name]);
  return Repl.createRepl({
    prompt: `nvx(${driver.origin})> `,
    commands: {
      help: () => help,
      connect: () => api.connect(),
      info: () => read("DeviceInfo"),
      caps: () => read("DeviceCapabilities"),
      discover: async () => print(await api.discover()),
      objects: () => nvxObjects.join(", "),
      read: ([name]) => read(objectName(name)),
      controls: async ([name]) => print(await api.controls(objectName(name))),
      streams: () => read("NaxAudio"),
      edids: async () => print((await api.refreshEdids()).objects),
      subscriptions: async () => print(await api.readSubscriptions()),
      control: async ([id, value, ...extra]) => {
        if (!id || value === undefined || extra.length) throw new Error("Usage: control <id> <value>");
        await api.control(id, scalar(value));
        return "Accepted.";
      },
      nax: async ([direction, key, action, value, ...extra]) => {
        if ((direction !== "Tx" && direction !== "Rx") ||
            !key || extra.length ||
            (action !== "address" && action !== "port" && action !== "name" && action !== "auto" &&
             action !== "start" && action !== "stop") ||
            ((action === "start" || action === "stop") !== (value === undefined))) {
          throw new Error(help);
        }
        await api.setNax(direction, key, action, action === "port" || action === "auto" ? scalar(value) : value ?? true);
        return "Accepted. Use 'streams' for readback.";
      },
    },
  });
}
