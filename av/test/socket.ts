import { toBuffer } from "@av/lib/buffer";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import type { Events, Sockets } from "@av/types";

export type TestSocketScriptStep<State = unknown> = {
  onWrite: string | Uint8Array | Buffer;
  sendBack: unknown | ((state: State) => unknown);
};

export class TestSocket<State = unknown>
  extends TypedEventTarget<Events.Socket.Map>
  implements Sockets.Client
{
  name = "test-socket";
  writes: Buffer[] = [];
  private script?: TestSocketScriptStep<State>[];
  config?: { throwIfWriteNotFound: boolean };
  state: State | undefined;
  tel: Telemetry;

  constructor(
    scripts?: TestSocketScriptStep<State>[],
    config?: { throwIfWriteNotFound: boolean },
  ) {
    super();
    this.script = scripts;
    this.config = config;
    this.tel = new Telemetry(`test-socket`);
  }

  start() {}
  end() {}

  write(data: string | Uint8Array | Buffer): number {
    const buffer = toBuffer(data);
    this.writes.push(buffer);

    this.tel.info("WROTE", {
      str: buffer.toString("utf8"),
      hex: buffer.toString("hex"),
    });

    if (this.script && this.script?.length > 0) {
      const index = this.script.findIndex((step) =>
        buffer.equals(toBuffer(step.onWrite)),
      );

      if (index === -1) {
        if (this.config?.throwIfWriteNotFound) {
          throw Error("unknown write received: " + data.toString("utf8"));
        }
        return buffer.length;
      }

      const [step] = this.script.splice(index, 1);

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
    const buffer = toBuffer(message);
    this.dispatch("receive", buffer);
  }
}
