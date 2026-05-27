import { RoomOSWriter } from "@av/drivers/cisco/roomos/writer";
import type { RoomOS, Generated } from "@av/drivers/cisco/roomos/types";

function send<C extends RoomOS.Format>(
  operation: RoomOS.WriteOperation,
  config: C,
): string {
  const writer = new RoomOSWriter(operation);
  let result: string;

  switch (config.type) {
    case "terminal":
      result = writer.ToTerminal(config.getResultId?.());
      break;
    case "xml":
      result = writer.ToXml(config.getResultId?.());
      break;
    case "jsonrpc":
      result = writer.ToJsonRpc(config.getId());
      break;
    default:
      throw new Error("Invalid proxy type");
  }

  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function methodSupported(root: Generated.Root, name: string): boolean {
  switch (root) {
    case "xCommand":
      return false;
    case "xConfiguration":
      return (
        name === "get" || name === "set" || name === "on" || name === "once"
      );
    case "xStatus":
      return name === "get" || name === "on" || name === "once";
    case "xFeedback":
      return name === "subscribe" || name === "on" || name === "once";
    default:
      return false;
  }
}

function buildCommandOperation(
  path: readonly string[],
  args?: Record<string, unknown>,
  body?: string,
): RoomOS.WriteOperation {
  return { kind: "command", root: "xCommand", path, args, body };
}

function buildGetOperation(
  root: "xConfiguration" | "xStatus",
  path: readonly string[],
): RoomOS.WriteOperation {
  return { kind: "get", root, path };
}

function buildSetOperation(
  path: readonly string[],
  value: unknown,
): RoomOS.WriteOperation {
  return { kind: "set", root: "xConfiguration", path, value };
}

function buildListenOperation(
  root: "xConfiguration" | "xStatus" | "xFeedback",
  path: readonly string[],
): RoomOS.WriteOperation {
  return { kind: "listen", root, path };
}

export function createProxy(
  root: Generated.Root,
  config: RoomOS.Format,
  path: readonly string[] = [root],
): any {
  const target = () => undefined;

  return new Proxy(target, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol" || prop === "then") {
        return undefined;
      }

      if (methodSupported(root, prop)) {
        return (...args: unknown[]) => {
          if (prop === "get") {
            if (root === "xConfiguration" || root === "xStatus") {
              return send(buildGetOperation(root, path), config);
            }

            throw new TypeError(`Object is not callable: ${root}`);
          }

          if (prop === "set") {
            if (root !== "xConfiguration") {
              throw new TypeError(`Object is not callable: ${root}`);
            }

            return send(buildSetOperation(path, args[0]), config);
          }

          if (
            root === "xConfiguration" ||
            root === "xStatus" ||
            root === "xFeedback"
          ) {
            return send(buildListenOperation(root, path), config);
          }

          throw new TypeError(`Object is not callable: ${root}`);
        };
      }

      return createProxy(root, config, [...path, prop]);
    },
    apply(_, __, args: unknown[]) {
      if (root !== "xCommand") {
        throw new TypeError(`Object is not callable: ${root}`);
      }

      if (args.length === 0) {
        return send(buildCommandOperation(path), config);
      }

      const [first, second] = args;

      if (typeof first === "string") {
        return send(buildCommandOperation(path, undefined, first), config);
      }

      if (isPlainRecord(first)) {
        if (typeof second === "string") {
          return send(buildCommandOperation(path, first, second), config);
        }

        return send(buildCommandOperation(path, first), config);
      }

      throw new TypeError("Invalid command arguments");
    },
  });
}
