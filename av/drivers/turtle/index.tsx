import { Driver } from "@av/driver";
import { RequestManager } from "@av/requests";
import { Delimiters } from "@av/sockets/delimiters";
import type { DeviceSocket } from "@av/types";

export default class ChazyControl<const N extends string = string> extends Driver<N> {
  mock = undefined;
  socket: DeviceSocket;
  requests: RequestManager<string, string>;

  constructor({ name, socket }: { name: N; socket: DeviceSocket }) {
    super({ name, driverName: "chazy-control" });
    this.socket = socket;
    this.requests = new RequestManager({
      socket: this.socket,
      delimiter: Delimiters.characterDelimted("CONTROLLER>"),
      tel: this.tel,
      formatter: (str) => {
        return Buffer.from(str + "\r");
      },
      timeoutMs: 1000,
      responseStrategy: {
        strategy: "blocking-queue",
        minGapMs: 1,
      },
    });
  }

  api = {
    GetDanteInfo: async () => {
      const result = await this.requests.request("DANTE DEV SEARCH");
      if (!result.ok) {
        this.tel.error("error", { error: result.error });
        return;
      }
      this.tel.debug(result.data);
    },
  };
  state = {};
}
