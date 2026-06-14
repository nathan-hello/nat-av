import type { Manager } from "@av/drivers";
import { Driver } from "@av/drivers";
import { RPCErrorCodes, RPCErrorData } from "@av/rpc/protocol";
import type { Drivers, Rpc } from "@av/types";

export class Debugger<
  N extends Drivers.Array = Drivers.Array,
> extends Driver<"debugger"> {
  state = {};

  api = {
    debug: {
      tree: async (): Promise<Rpc.Debug.Node[]> => {
        const toNode = (driver: Driver): Rpc.Debug.Node | undefined => {
          if (driver.name === "debugger") {
            return;
          }
          const socket = driver.socket;
          const canWrite = typeof socket?.write === "function";
          const canReceive = typeof socket?.on === "function";

          return {
            name: driver.name,
            driverName: driver._drivername,
            children: Object.values(driver.deps.get() as Record<string, Driver>)
              .map((child) => toNode(child))
              .filter((s) => s !== undefined),
            ...(typeof socket?.name === "string" ?
              {
                socket: {
                  traceName: socket.name,
                  canWrite,
                  canReceive,
                },
              }
            : {}),
          };
        };
        return this.natav.configs
          .map((driver) => toNode(driver))
          .filter((s) => s !== undefined);
      },
      socket: this.writeSocket,
    },
  };

  constructor(private natav: Manager<N>) {
    super({ name: "debugger", driverName: "debugger" });
  }

  private async writeSocket(params: {
    deviceName: Drivers.Names<N>;
    text: string | Uint8Array;
    encoding?: BufferEncoding;
  }): Promise<{ bytesWritten: number }> {
    if (!params || typeof params !== "object") {
      throw new RPCErrorData({
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid debug socket write params",
      });
    }

    if (
      typeof params.deviceName !== "string" ||
      typeof params.text !== "string"
    ) {
      throw new RPCErrorData({
        code: RPCErrorCodes.InvalidParams,
        message: "Debug socket write requires string deviceName and text",
      });
    }

    const result = await this.tel.task("debugger:socket-write", async () => {
      const device = this.natav.FindDriver(params.deviceName);
      if (!device) {
        throw new RPCErrorData({
          code: RPCErrorCodes.DeviceNotFound,
          message: `Device "${params.deviceName}" not found`,
          data: { availableDevices: this.natav.GetAllDriverNames() },
        });
      }

      if (typeof device.socket?.write !== "function") {
        throw new RPCErrorData({
          code: RPCErrorCodes.MethodNotFound,
          message: `Device "${params.deviceName}" does not expose a writable socket`,
        });
      }

      const bytesWritten = await device.socket.write(params.text);
      return { bytesWritten };
    });

    if (result.ok) {
      return result.data;
    }

    throw new RPCErrorData({
      code: RPCErrorCodes.InternalError,
      message: result.error,
    });
  }
}
