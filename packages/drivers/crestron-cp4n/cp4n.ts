import { Err } from "@nat-av/core";
import { Agent } from "undici";
import {
  CrestronHttpDriver,
  type DeviceEndpoint,
  type Transport,
} from "./http.js";

/** A CresNext object name such as Programs, Router or NetworkAdapters. */
export type Cp4nObject = string;
/** Objects whose shape Crestron documents for 4-Series control processors. */
export const cp4nObjects = [
  "DeviceInfo",
  "Programs",
  "Router",
  "NetworkAdapters",
] as const;

function objectName(name: unknown): Cp4nObject {
  if (typeof name !== "string" || !/^[A-Z][A-Za-z0-9]{0,63}$/.test(name))
    throw new Error("Choose a CresNext object name such as Programs.", {
      cause: Err.Codes.RpcInvalidParams,
    });
  return name;
}

function patchObject(patch: unknown): Record<string, unknown> {
  if (
    patch === null ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    !Object.keys(patch).length
  )
    throw new Error(
      "Supply a nonempty partial object; an empty object deletes the target.",
      { cause: Err.Codes.RpcInvalidParams },
    );
  // TSAS: The guard above excludes null, arrays and primitives.
  return structuredClone(patch as Record<string, unknown>);
}

/**
 * Crestron 4-Series control processor (CP4N and relatives) over CresNext
 * HTTPS. Reads return the native `{ Device: { [object]: ... } }` response;
 * writes POST a partial object to /Device and require every action result to
 * succeed. Login requires the processor's XSRF token. No polling or retries.
 */
export class Cp4nDriver<
  const Name extends string = string,
> extends CrestronHttpDriver<Name> {
  state = { connected: false };
  constructor(
    name: Name,
    endpoint: DeviceEndpoint,
    factory: () => Transport = () => {
      const dispatcher = new Agent({
        connect: { rejectUnauthorized: !endpoint.allowSelfSigned },
      });
      return {
        fetch: (url, init) => {
          // undici's dispatcher is not part of the DOM RequestInit type.
          const options = { ...init, dispatcher };
          return fetch(url, options);
        },
        close: () => {
          void dispatcher.destroy();
        },
      };
    },
  ) {
    super(name, endpoint, factory, true);
  }
  override api = {
    connect: () => this.login(),
    disconnect: () => this.logout(),
    /** GET /Device/<object>/ */
    read: async (object: Cp4nObject) => this.readObject(objectName(object)),
    /** POST a partial object to /Device. */
    set: async (object: Cp4nObject, patch: Record<string, unknown>) =>
      this.writeObject(objectName(object), patchObject(patch)),
    deviceInfo: () => this.readObject("DeviceInfo"),
    programs: () => this.readObject("Programs"),
    router: () => this.readObject("Router"),
    networkAdapters: () => this.readObject("NetworkAdapters"),
    setRouter: async (patch: Record<string, unknown>) =>
      this.writeObject("Router", patchObject(patch)),
  };
}
