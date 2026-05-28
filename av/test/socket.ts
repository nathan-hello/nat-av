import { toBuffer } from "@av/lib/buffer";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { Events, Sockets } from "@av/types";

export type TestSocketScriptStep<State = unknown> = {
  onWrite: string | Uint8Array | Buffer;
  sendBack: unknown | ((state: State) => unknown);
};

export class TestSocket<State = unknown>
  extends TypedEventTarget<Events.Socket.Map>
  implements Sockets.Socket
{
  name = "test-socket";
  writes: string[] = [];
  private script?: {
    scripts: TestSocketScriptStep<State>[];
    config: { errorIfWriteNotFound: boolean };
  };
  state: State | undefined;

  constructor({
    script,
    state,
  }: {
    script?: {
      scripts: TestSocketScriptStep<State>[];
      config: { errorIfWriteNotFound: boolean };
    };
    state?: State;
  } = {}) {
    super();
    this.script = script;
    this.state = state;
  }

  start() {}
  end() {}

  write(data: string | Uint8Array | Buffer): number {
    const buffer = toBuffer(data);
    this.writes.push(buffer.toString("utf8"));

    if (this.script && this.script.scripts?.length > 0) {
      const index = this.script.scripts.findIndex((step) =>
        buffer.equals(toBuffer(step.onWrite)),
      );

      if (index === -1) {
        if (this.script.config.errorIfWriteNotFound) {
          throw Error("unknown write received: " + data.toString("utf8"));
        }
        return buffer.length;
      }

      const [step] = this.script.scripts.splice(index, 1);

      if (typeof step.sendBack === "function") {
        this.receive(step.sendBack(this.state));
      } else {
        this.receive(step.sendBack);
      }
    }

    return buffer.length;
  }

  updateState(state: State) {
    this.state = state;
  }

  receive(message: unknown) {
    this.dispatch("receive", toBuffer(message));
  }

}
