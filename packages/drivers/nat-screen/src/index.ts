import {
  create,
  fromBinary,
  toBinary,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import {
  Natav,
  Delimiters,
  RequestManager,
  TypedEventTarget,
  type Sockets,
} from "@nat-av/core";
import {
  ApplyReceiverConfigRequestSchema,
  ApplySenderConfigRequestSchema,
  ControlRequestSchema,
  ControlResponseSchema,
  DiscoverRequestSchema,
  GetConfigRequestSchema,
  GetConfigRequest_Kind,
  GetStatusRequestSchema,
  ReceiverConfigSchema,
  SceneSchema,
  SenderConfigSchema,
  StatusSchema,
  Status_Code,
  UpdateSceneRequestSchema,
  type ControlRequest,
  type ControlResponse,
  type DiscoveryResponse,
  type ErrorEvent,
  type ReceiverConfig,
  type RuntimeStatus,
  type SenderConfig,
  type Status,
} from "../proto/generated/media_control_pb.js";

export * from "../proto/generated/media_control_pb.js";

const PROTOCOL_VERSION = 2;
const MAX_PAYLOAD_BYTES = 65_536;

export type NatScreenKind = "sender" | "receiver";

export type NatScreenRuntimeStatus = {
  running: boolean;
  videoFrames: string;
  audioFrames: string;
  droppedPackets: string;
  bytesSent: string;
  bytesReceived: string;
};

export type NatScreenState = {
  connected: boolean;
  revision: string;
  runtimeStatus?: NatScreenRuntimeStatus;
  senderConfig?: SenderConfig;
  receiverConfig?: ReceiverConfig;
  lastError?: string;
};

export class NatScreenError extends Error {
  readonly code: Status_Code;
  readonly revision: bigint;

  constructor(status: Status, revision: bigint) {
    super(
      status.message ||
        `screen media request failed with status ${status.code}`,
    );
    this.name = "NatScreenError";
    this.code = status.code;
    this.revision = revision;
  }
}

type RequestPayload = Exclude<ControlRequest["request"], { case: undefined }>;

export default class NatScreen<
  const N extends string = string,
> extends Natav.Driver<N, NatScreenState> {
  readonly kind: NatScreenKind;
  readonly socket: Sockets.Client;
  readonly events = new TypedEventTarget<{ error: ErrorEvent }>();

  state: NatScreenState = {
    connected: false,
    revision: "0",
  };

  private revision = 0n;
  private nextRequestId = 1n;
  private readonly requests: RequestManager<ControlRequest, ControlResponse>;

  constructor({
    name,
    kind,
    socket,
  }: {
    name: N;
    kind: NatScreenKind;
    socket: Sockets.Client;
  }) {
    super({ name });
    this.kind = kind;
    this.socket = socket;

    const { delimiter, formatter } = Delimiters.protobuf.lengthPrefixed32BE({
      encode: (request: ControlRequest) =>
        toBinary(ControlRequestSchema, request),
      decode: (payload) => fromBinary(ControlResponseSchema, payload),
      minPayloadBytes: 1,
      maxPayloadBytes: MAX_PAYLOAD_BYTES,
    });

    this.requests = new RequestManager({
      socket,
      tel: this.tel,
      formatter,
      delimiter,
      responseStrategy: {
        strategy: "match",
        matchFn: (request, response) =>
          response.requestId !== 0n && request.requestId === response.requestId,
      },
    });

    this.requests.on("delimited", (response) => {
      this.dispatch(
        "driver:delimited",
        toBinary(ControlResponseSchema, response),
      );
      if (response.requestId === 0n) {
        this.observe(response);
      }
    });

    socket.on("connected", () => {
      this.state.connected = true;
      this.dispatch("driver:state-updated", { data: { connected: true } });
      void this.api.getStatus().catch((error: unknown) => {
        this.tel.warn("initial-status-request-failed", { error });
      });
    });

    socket.on("disconnected", () => {
      this.state.connected = false;
      this.dispatch("driver:state-updated", { data: { connected: false } });
    });
  }

  api = {
    getStatus: async (): Promise<NatScreenRuntimeStatus> => {
      const response = await this.request({
        case: "getStatus",
        value: create(GetStatusRequestSchema),
      });
      if (response.payload.case !== "runtimeStatus") {
        throw this.unexpectedPayload("runtimeStatus", response);
      }
      return runtimeStatus(response.payload.value);
    },

    getConfig: async (): Promise<SenderConfig | ReceiverConfig> => {
      const requestKind =
        this.kind === "sender" ?
          GetConfigRequest_Kind.SENDER
        : GetConfigRequest_Kind.RECEIVER;
      const response = await this.request({
        case: "getConfig",
        value: create(GetConfigRequestSchema, { kind: requestKind }),
      });
      const expected =
        this.kind === "sender" ? "senderConfig" : "receiverConfig";
      if (response.payload.case !== expected) {
        throw this.unexpectedPayload(expected, response);
      }
      return response.payload.value;
    },

    applySenderConfig: async (
      config: MessageInitShape<typeof SenderConfigSchema>,
    ): Promise<string> => {
      this.requireKind("sender");
      const response = await this.request({
        case: "applySenderConfig",
        value: create(ApplySenderConfigRequestSchema, {
          expectedRevision: this.revision,
          config: create(SenderConfigSchema, config),
        }),
      });
      return response.revision.toString();
    },

    applyReceiverConfig: async (
      config: MessageInitShape<typeof ReceiverConfigSchema>,
    ): Promise<string> => {
      this.requireKind("receiver");
      const response = await this.request({
        case: "applyReceiverConfig",
        value: create(ApplyReceiverConfigRequestSchema, {
          expectedRevision: this.revision,
          config: create(ReceiverConfigSchema, config),
        }),
      });
      return response.revision.toString();
    },

    updateScene: async (
      scene: MessageInitShape<typeof SceneSchema>,
    ): Promise<string> => {
      this.requireKind("receiver");
      const response = await this.request({
        case: "updateScene",
        value: create(UpdateSceneRequestSchema, {
          expectedRevision: this.revision,
          scene: create(SceneSchema, scene),
        }),
      });
      return response.revision.toString();
    },

    discover: async (
      request: MessageInitShape<typeof DiscoverRequestSchema>,
    ): Promise<DiscoveryResponse> => {
      const response = await this.request({
        case: "discover",
        value: create(DiscoverRequestSchema, request),
      });
      if (response.payload.case !== "discovery") {
        throw this.unexpectedPayload("discovery", response);
      }
      return response.payload.value;
    },
  };

  override end(): Promise<void> | void {
    this.requests.end();
    return super.end();
  }

  private async request(request: RequestPayload): Promise<ControlResponse> {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1n;
    const message = create(ControlRequestSchema, {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      request,
    });
    const result = await this.requests.request(message);
    if (!result.ok) {
      throw result.error;
    }

    const response = result.data;
    if (response.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `screen media protocol version ${response.protocolVersion} does not match ${PROTOCOL_VERSION}`,
      );
    }
    this.observe(response);
    if (!response.status || response.status.code !== Status_Code.OK) {
      throw new NatScreenError(
        response.status ?? createStatusUnspecified(),
        response.revision,
      );
    }
    return response;
  }

  private observe(response: ControlResponse): void {
    if (response.requestId === 0n) {
      if (response.payload.case === "error") {
        this.state.lastError = response.payload.value.error;
        this.events.dispatch("error", response.payload.value);
        this.dispatch("driver:state-updated", {
          data: { lastError: this.state.lastError },
        });
      }
      return;
    }

    this.revision = response.revision;
    this.state.revision = response.revision.toString();
    const update: Partial<NatScreenState> = {
      revision: this.state.revision,
    };

    switch (response.payload.case) {
      case "runtimeStatus":
        this.state.runtimeStatus = runtimeStatus(response.payload.value);
        update.runtimeStatus = this.state.runtimeStatus;
        break;
      case "senderConfig":
        this.state.senderConfig = response.payload.value;
        update.senderConfig = response.payload.value;
        break;
      case "receiverConfig":
        this.state.receiverConfig = response.payload.value;
        update.receiverConfig = response.payload.value;
        break;
    }

    this.dispatch("driver:state-updated", { data: update });
  }

  private requireKind(expected: NatScreenKind): void {
    if (this.kind !== expected) {
      throw new Error(
        `screen media ${this.kind} does not support ${expected} configuration`,
      );
    }
  }

  private unexpectedPayload(
    expected: string,
    response: ControlResponse,
  ): Error {
    return new Error(
      `screen media expected ${expected} payload, received ${response.payload.case ?? "none"}`,
    );
  }
}

function runtimeStatus(status: RuntimeStatus): NatScreenRuntimeStatus {
  return {
    running: status.running,
    videoFrames: status.videoFrames.toString(),
    audioFrames: status.audioFrames.toString(),
    droppedPackets: status.droppedPackets.toString(),
    bytesSent: status.bytesSent.toString(),
    bytesReceived: status.bytesReceived.toString(),
  };
}

function createStatusUnspecified(): Status {
  return create(StatusSchema, {
    code: Status_Code.UNSPECIFIED,
    message: "response omitted status",
  });
}

export type SenderConfigInput = MessageInitShape<typeof SenderConfigSchema>;
export type ReceiverConfigInput = MessageInitShape<typeof ReceiverConfigSchema>;
export type SceneInput = MessageInitShape<typeof SceneSchema>;
export type DiscoverInput = MessageInitShape<typeof DiscoverRequestSchema>;
