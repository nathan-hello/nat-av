import { Delimiters, Driver, RequestManager, type Sockets } from "@av/index";

export default class ChazyControl<
  const N extends string = string,
> extends Driver<N> {
  mock = undefined;
  socket: Sockets.Client;
  requests: RequestManager<string, string>;

  constructor({ name, socket }: { name: N; socket: Sockets.Client }) {
    super({ name });
    this.socket = socket;
    this.requests = new RequestManager({
      socket: this.socket,
      delimiter: Delimiters.characterDelimted(
        ["CONTROLLER>", "\r\n\r\n", "\\r\\n\\r\\n"],
        false,
      ),
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

    this.requests.on("delimited", (event) => {
      this.dispatch("driver:delimited", event);
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
