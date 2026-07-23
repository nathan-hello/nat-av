import { Driver } from "@av/drivers";

export type RelayBoardState = {
  /** True means the relay is currently closed. */
  closed: boolean[];
};

export type RelayBoardApi = {
  open: (relay: number) => Promise<void>;
  close: (relay: number) => Promise<void>;
};

export class RelayBoard<const N extends string = string> extends Driver<
  N,
  [],
  RelayBoardApi,
  RelayBoardState
> {
  private readonly baseUrl: string;
  private readonly pending = Array.from({ length: 16 }, () =>
    Promise.resolve(),
  );

  state: RelayBoardState = { closed: Array.from({ length: 16 }, () => false) };

  constructor({ name, address = "192.168.1.4" }: { name: N; address?: string }) {
    super({ name });
    this.baseUrl = `http://${address}`;
  }

  api: RelayBoardApi = {
    open: (relay) => this.setRelay(relay, false),
    close: (relay) => this.setRelay(relay, true),
  };

  private async setRelay(relay: number, closed: boolean): Promise<void> {
    const index = this.relayIndex(relay);
    const operation = this.pending[index].catch(() => {}).then(async () => {
      const command = (index * 2 + (closed ? 1 : 0))
        .toString(10)
        .padStart(2, "0");
      const result = await this.tel.task(
        `relay-board:${closed ? "close" : "open"}:${relay}`,
        async () => {
          const response = await fetch(`${this.baseUrl}/30000/${command}`);
          if (!response.ok) {
            throw new Error(`relay board returned HTTP ${response.status}`);
          }
        },
      );

      if (!result.ok) {
        throw result.error;
      }

      this.state.closed[index] = closed;
      this.dispatch("driver:state-updated", {
        data: { closed: this.state.closed },
      });
    });

    this.pending[index] = operation;
    return operation;
  }

  private relayIndex(relay: number): number {
    if (!Number.isInteger(relay) || relay < 1 || relay > 16) {
      throw new RangeError("relay must be an integer from 1 through 16");
    }

    return relay - 1;
  }
}

export default RelayBoard;
