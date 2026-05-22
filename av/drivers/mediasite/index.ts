import { Driver } from "../../driver";
import { TypedEventTarget } from "../../lib/eventtarget";
import type { DeviceSocket, Schema } from "@av/types";

type MediasiteStatus = "IDLE" | "RECBUSY" | "RECORD" | "PAUSED" | "PUBLISH";

type MediasiteState = {
  status: MediasiteStatus | null;
  time: string | null;
  version: string | null;
  error: string | null;
  errorFlag: boolean;
  imageCount: number | null;
  imageAutoScene: boolean;
  publish: boolean;
  presentationTitle: string | null;
  scheduledId: string | null;
};

type McipReply = { command: string; params: string };

type PollQuery =
  | "status"
  | "time"
  | "version"
  | "error"
  | "errorText"
  | "publish"
  | "presentationTitle"
  | "imageAutoScene"
  | "imageCount";

const POLL_COMMANDS: Record<PollQuery, string> = {
  status: "STATUS",
  time: "TIME",
  version: "VERSION",
  error: "ERROR",
  errorText: "ETEXT",
  publish: "PUBLISH",
  presentationTitle: "PRESENTATIONTITLE",
  imageAutoScene: "IMAGEAUTO",
  imageCount: "IMAGECOUNT",
};

class McipPending extends TypedEventTarget<Record<string, McipReply>> {
  queue: { id: number; command: string }[] = [];
  processing = false;
  highestId = 0;
  currentId: number | null = null;
}

export default class Mediasite<const N extends string = string> extends Driver<N> {
  private TIMEOUT_MS = 5000;
  private rxBuf = "";
  private pending = new McipPending();
  private pollTimer: NodeJS.Timeout | null = null;

  state: MediasiteState = {
    status: null,
    time: null,
    version: null,
    error: null,
    errorFlag: false,
    imageCount: null,
    imageAutoScene: false,
    publish: false,
    presentationTitle: null,
    scheduledId: null,
  };

  mock = undefined;
  socket: DeviceSocket;

  constructor({
    name,
    socket,
    poll,
  }: {
    name: N;
    socket: DeviceSocket;
    poll?: { queries: PollQuery[]; intervalMs?: number };
  }) {
    super({ name, driverName: "mediasite" });
    this.socket = socket;

    socket.on("connected", () => {
      this.tel.info("CONNECTED");
      if (poll?.queries.length) {
        this.startPolling(poll.queries, poll.intervalMs ?? 5000);
      }
    });

    socket.on("disconnected", () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    });

    socket.on("receive", (chunk) => {
      this.rxBuf += chunk.toString("ascii");

      while (true) {
        const crIndex = this.rxBuf.indexOf("\r");
        if (crIndex === -1) return;

        const line = this.rxBuf.substring(0, crIndex).trim();
        this.rxBuf = this.rxBuf.substring(crIndex + 1);

        if (!line.length) continue;

        this.tel.info("RX", { line });

        let message = line;
        if (message.startsWith("* ")) {
          message = message.substring(2);
        }

        const spaceIndex = message.indexOf(" ");
        const command =
          spaceIndex === -1 ?
            message.toUpperCase()
          : message.substring(0, spaceIndex).toUpperCase();
        const params = spaceIndex === -1 ? "" : message.substring(spaceIndex + 1);

        this.processResponse(command, params);

        if (this.pending.currentId !== null) {
          this.pending.dispatch(this.pending.currentId.toString(), { command, params });
        }
      }
    });
  }

  private processResponse(command: string, params: string) {
    switch (command) {
      case "STATUS":
        // TSAS:
        this.state.status = params as MediasiteStatus;
        this.dispatch("driver:state-updated", { status: this.state.status });
        break;
      case "TIME":
        this.state.time = params;
        this.dispatch("driver:state-updated", { time: this.state.time });
        break;
      case "VERSION":
        this.state.version = params;
        this.dispatch("driver:state-updated", { version: this.state.version });
        break;
      case "IMAGECOUNT":
        this.state.imageCount = parseInt(params) || 0;
        this.dispatch("driver:state-updated", { imageCount: this.state.imageCount });
        break;
      case "PUBLISH":
        this.state.publish = params === "TRUE";
        this.dispatch("driver:state-updated", { publish: this.state.publish });
        break;
      case "ERROR":
        this.state.errorFlag = params === "TRUE";
        if (!this.state.errorFlag) this.state.error = null;
        this.dispatch("driver:state-updated", {
          errorFlag: this.state.errorFlag,
          error: this.state.error,
        });
        break;
      case "ETEXT":
        this.state.error = params;
        this.dispatch("driver:state-updated", { error: this.state.error });
        break;
      case "IMAGEAUTO":
        this.state.imageAutoScene = params === "TRUE";
        this.dispatch("driver:state-updated", { imageAutoScene: this.state.imageAutoScene });
        break;
      case "PRESENTATIONTITLE":
        this.state.presentationTitle = params;
        this.dispatch("driver:state-updated", { presentationTitle: this.state.presentationTitle });
        break;
      case "SCHEDULEDID":
        this.state.scheduledId = params;
        this.dispatch("driver:state-updated", { scheduledId: this.state.scheduledId });
        break;
      case "EMESSAGE":
        this.tel.error("INVALID_COMMAND", { params });
        this.state.error = `Invalid command: ${params}`;
        this.dispatch("driver:state-updated", { error: this.state.error });
        break;
      default:
        this.tel.warn("UNHANDLED_RESPONSE", { command, params });
        break;
    }
  }

  schema = (): Schema<this> => {
    // TSAS: TODO: Implement schema.
    return [] as unknown as Schema<this>;
  };

  private send(command: string) {
    const msg = `* ${command} \r`;
    this.tel.info("TX", { msg: msg.trim() });
    this.socket.write(Buffer.from(msg, "ascii"));
  }

  private request(command: string): Promise<McipReply> {
    const id = this.pending.highestId++;
    this.pending.queue.push({ id, command });
    if (!this.pending.processing) this.process();
    return this.pending.once(id.toString(), {
      signal: AbortSignal.timeout(this.TIMEOUT_MS),
    });
  }

  private async process() {
    this.pending.processing = true;
    while (this.pending.queue.length) {
      const { id, command } = this.pending.queue.shift()!;
      this.pending.currentId = id;
      this.send(command);
      try {
        await this.pending.once(id.toString(), {
          signal: AbortSignal.timeout(this.TIMEOUT_MS),
        });
      } catch {
        // timeout, advance to next
      }
    }
    this.pending.currentId = null;
    this.pending.processing = false;
  }

  private query(command: string) {
    return this.request(`${command} ?`);
  }

  private startPolling(queries: PollQuery[], interval: number) {
    this.pollTimer = setInterval(() => {
      for (const q of queries) {
        this.query(POLL_COMMANDS[q]).catch(() => {});
      }
    }, interval);
  }

  api = {
    // Recording control
    record: () => this.request("RECORD"),
    stop: () => this.request("STOP"),
    pause: () => this.request("PAUSE"),
    addChapter: () => this.request("ADDCHAPTER"),

    // System
    wakePreview: () => this.request("WAKEPREVIEW"),
    reboot: () => this.request("REBOOT"),
    shutdown: () => this.request("SHUTDOWN"),

    // Image
    imageAdvance: () => this.request("IMAGEADVANCE"),
    imageAutoScene: (on: boolean) => this.request(`IMAGEAUTO ${on ? "TRUE" : "FALSE"}`),
    presetIndex: (index: number) => this.request(`PRESETINDEX ${index}`),

    // Encoding profile
    selectProfile: (index: number) => this.request(`PROFILEINDEX ${index}`),

    // Schedule
    selectScheduled: (id: string) => this.request(`SCHEDULEDID ${id}`),
    scheduledToday: (on: boolean) => this.request(`SCHEDULEDTODAY ${on ? "TRUE" : "FALSE"}`),

    // Video routing
    route: (input: string, output = "Video1") => this.request(`ROUTE "${input}" ${output}`),
    unroute: (output: string) => this.request(`UNROUTE ${output}`),
    encoderVideoInput: (route: number, stream: string) =>
      this.request(`ENCODERVIDEOINPUT ${route} ${stream}`),

    // Audio
    audioRecordLevel: (level: number) => this.request(`AUDIORECORDLEVEL ${level}`),

    // Queries
    queryStatus: () => this.query("STATUS"),
    queryTime: () => this.query("TIME"),
    queryVersion: () => this.query("VERSION"),
    queryError: () => this.query("ERROR"),
    queryErrorText: () => this.query("ETEXT"),
    queryAudioLevel: () => this.query("AUDIOLEVEL"),
    queryAudioStatus: () => this.query("AUDIOSTATUS"),
    queryFreeSpace: () => this.query("FREESPACE"),
    queryPresentationTitle: () => this.query("PRESENTATIONTITLE"),
    queryScheduledCount: () => this.query("SCHEDULEDCOUNT"),
    queryInputCount: () => this.query("INPUTCOUNT"),
    queryPresentationOutputs: () => this.query("PRESENTATIONOUTPUTS"),
  };
}
