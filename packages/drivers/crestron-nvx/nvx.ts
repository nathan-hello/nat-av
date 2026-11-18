import {
  CrestronHttpDriver,
  object,
  type DeviceEndpoint,
  type Transport,
  limitedBytes,
  checkActions,
} from "./http.js";
import { Err } from "@nat-av/core";
import { Agent } from "undici";
import {
  controlChange,
  nvxControls,
  nvxDynamicControlObject,
  reportedControls,
  type NvxControl,
  type NvxOptionGroups,
} from "./client/catalog.js";
import {
  nvxDiscovery,
  nvxProbeObjects,
  nvxProfile,
  nvxProfileAllows,
  type NvxDiscovery,
} from "./client/discovery.js";

import {
  assertJsonObject,
  nvxObjects,
  nvxReadOnlyObjects,
  nvxEdidChange,
  nvxHdcpChange,
  nvxScalerChange,
  nvxNaxChange,
  nvxEdidLibrary,
  nvxCurrentEdid,
  nvxSubscriptionsChange,
  nvxAdministrationChange,
  nvxSubscriptionEntryChange,
  nvxUploadRequest,
  nvxSubscriptionsFromXml,
  nvxSubscriptionsToXml,
  nvxDeleteEdidChange,
  nvxEdidUploadRequest,
  validateEdidUpload,
  type JsonObject,
  type JsonValue,
  type NvxChange,
  type NvxObject,
  type NvxSnapshot,
  type NvxState,
} from "./client/catalog.js";
export { nvxObjects, type NvxObject, type NvxSnapshot } from "./client/catalog.js";

/** Concurrent GETs per endpoint during discover(); browsers use six per host. */
const discoveryConcurrency = 6;

/** NVX HTTPS control. Device feedback determines the available stream slots. */
export class NvxDriver<
  const Name extends string = string,
> extends CrestronHttpDriver<Name, NvxState> {
  override state: NvxState = {
    connected: false,
    snapshot: { objects: {}, readAt: "" },
  };
  get snapshot() {
    return this.state.snapshot;
  }
  constructor(
    name: Name,
    endpoint: DeviceEndpoint,
    factory: () => Transport = () => {
      const dispatcher = new Agent({
        connect: { rejectUnauthorized: !endpoint.allowSelfSigned },
      });
      return {
        fetch: (url, init) => {
          const options = { ...init, dispatcher };
          return fetch(url, options);
        },
        close: () => {
          void dispatcher.destroy();
        },
      };
    },
    private readonly optionGroups: NvxOptionGroups = {},
  ) {
    super(name, endpoint, factory, false);
  }
  /** Drops the previous device's discovery before authenticating again. */
  override async login(
    credentials?: () => Promise<Pick<DeviceEndpoint, "username" | "password">>,
  ): Promise<void> {
    if (this.state.discovery) {
      const { discovery: _, ...state } = this.state;
      this.state = state;
      this.dispatch("driver:state-updated", { data: this.state });
    }
    return super.login(credentials);
  }
  /**
   * Read DeviceInfo, match its model against the SDK-derived profile, then
   * read every other catalog object the profile allows. The result lists the
   * objects and controls this device actually reported. GET requests only.
   */
  async discover(): Promise<NvxDiscovery> {
    return this.exclusive(async () => {
      this.requireConnected();
      const info = (await this.readSnapshot("DeviceInfo")).objects.DeviceInfo;
      const profile = nvxProfile(info?.Model);
      const names = nvxProbeObjects().filter((name) =>
        nvxProfileAllows(profile, name),
      );
      const missing = new Set<NvxObject>();
      // Probe concurrently, but at most as many requests as a browser would
      // open to one host, so the endpoint's web server is not flooded.
      let next = 0;
      const probe = async () => {
        while (next < names.length) {
          const name = names[next++];
          try {
            await this.readSnapshot(name);
          } catch (error) {
            // Authentication or transport failures end discovery; absence does not.
            if (!this.authenticated) throw error;
            const objects = { ...this.snapshot.objects };
            delete objects[name];
            this.state = {
              ...this.state,
              snapshot: { ...this.snapshot, objects },
            };
            missing.add(name);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(discoveryConcurrency, names.length) }, probe),
      );
      const unsupported = names.filter((name) => missing.has(name));
      const discovery = nvxDiscovery(
        this.snapshot,
        unsupported,
        this.optionGroups,
      );
      this.state = { ...this.state, discovery };
      this.dispatch("driver:state-updated", { data: this.state });
      return structuredClone(discovery);
    });
  }
  /** Caller holds the request lock. Dynamic controls re-read their object. */
  private async controlFor(id: string): Promise<NvxControl> {
    const discovery = this.state.discovery;
    const dynamic = nvxDynamicControlObject(id);
    if (dynamic) {
      const snapshot = await this.readSnapshot(dynamic);
      const control = reportedControls(
        dynamic,
        snapshot.objects[dynamic] ?? {},
        this.optionGroups,
        discovery ?
          {
            ...(discovery.profile ?
              { audioSources: discovery.profile.audioSources }
            : {}),
            inputs: discovery.inputs.hdmi + discovery.inputs.usbC,
          }
        : {},
      ).find((entry) => entry.id === id);
      if (!control)
        throw new Error(`This device did not report control ${id}.`);
      return control;
    }
    const control =
      discovery ?
        discovery.controls.find((entry) => entry.id === id)
      : nvxControls.find((entry) => entry.id === id);
    if (!control)
      throw new Error(
        discovery ?
          `This device did not report control ${id}.`
        : "Choose a supported NVX control.",
        { cause: Err.Codes.RpcInvalidParams },
      );
    return control;
  }
  /** Validate a control against this device without writing it. */
  async change(id: string, value: unknown): Promise<NvxChange> {
    return this.exclusive(async () => {
      const control = await this.controlFor(id);
      return this.validated(() => controlChange(control, value));
    });
  }
  private validated(build: () => NvxChange): NvxChange {
    try {
      return build();
    } catch (error) {
      throw new Error(
        error instanceof Error ?
          error.message
        : "Invalid NVX control parameters.",
        { cause: Err.Codes.RpcInvalidParams },
      );
    }
  }
  private validate(name: string): asserts name is NvxObject {
    if (!nvxObjects.some((entry) => entry === name))
      throw new Error("Unsupported NVX API object.", {
        cause: Err.Codes.RpcInvalidParams,
      });
  }
  async refresh(name: NvxObject): Promise<NvxSnapshot> {
    return this.exclusive(() => this.readSnapshot(name));
  }
  private async readSnapshot(name: NvxObject): Promise<NvxSnapshot> {
    this.validate(name);
    const result = object(object(await this.readDeviceObject(name)).Device)[
      name
    ];
    if (!Object.keys(object(result)).length) {
      throw new Error(
        `NVX did not report ${name}. This object may not be supported by its firmware.`,
      );
    }
    const data = redactDeviceData(result);
    assertJsonObject(data);
    this.state = {
      ...this.state,
      snapshot: {
        objects: { ...this.snapshot.objects, [name]: data },
        readAt: new Date().toISOString(),
      },
    };
    this.dispatch("driver:state-updated", { data: this.state });
    return structuredClone(this.snapshot);
  }
  async set(name: NvxObject, patch: Record<string, unknown>): Promise<void> {
    return this.exclusive(() => this.writeSnapshot(name, patch));
  }
  private async writeSnapshot(
    name: NvxObject,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.validate(name);
    assertJsonObject(patch);
    const payload = structuredClone(patch);
    if (nvxReadOnlyObjects.includes(name)) {
      throw new Error("This NVX object is read-only in this driver.", {
        cause: Err.Codes.RpcInvalidParams,
      });
    }
    if (!Object.keys(payload).length) {
      throw new Error(
        "Supply a nonempty partial object; empty-object deletion is not supported here.",
        { cause: Err.Codes.RpcInvalidParams },
      );
    }
    this.requireConnected();
    const profile = this.state.discovery?.profile;
    if (!nvxProfileAllows(profile, name))
      throw new Error(
        `${profile?.model} does not support ${name} according to its SDK profile.`,
        { cause: Err.Codes.RpcInvalidParams },
      );
    const streams = this.snapshot.objects[name]?.Streams;
    if (
      Array.isArray(payload.Streams) &&
      Array.isArray(streams) &&
      payload.Streams.some(
        (_, index) => object(streams[index]).Processing === true,
      )
    ) {
      throw new Error(
        "NVX stream is processing a previous change. Refresh manually before sending another command.",
      );
    }
    // Publish replacement feedback before dispatch, including uncertain writes.
    const objects = { ...this.snapshot.objects };
    delete objects[name];
    this.state = { ...this.state, snapshot: { ...this.snapshot, objects } };
    this.dispatch("driver:state-updated", { data: this.state });
    await this.writeDeviceObject(name, payload);
  }
  control(id: string, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const control = await this.controlFor(id);
      const change = this.validated(() => controlChange(control, value));
      await this.writeSnapshot(change.object, change.patch);
    });
  }
  async refreshEdids(): Promise<NvxSnapshot> {
    return this.exclusive(() => this.readEdids());
  }
  private async readEdids(): Promise<NvxSnapshot> {
    this.requireConnected();
    this.invalidateEdids();
    try {
      await this.readSnapshot("AvioV2");
    } catch (error) {
      if (!this.authenticated) throw error;
      await this.readSnapshot("AudioVideoInputOutput");
    }
    try {
      await this.readSnapshot("EdidMgmnt");
    } catch (error) {
      if (!this.authenticated) throw error;
      if (!this.snapshot.objects.AudioVideoInputOutput)
        await this.readSnapshot("AudioVideoInputOutput");
    }
    return structuredClone(this.snapshot);
  }
  async uploadEdid(
    name: string,
    base64: string,
    legacy: boolean,
  ): Promise<void> {
    validateEdidUpload(name, base64);
    if (typeof legacy !== "boolean")
      throw new Error("Choose the EDID API version.");
    return this.exclusive(async () => {
      this.requireConnected();
      const { path, fields } = nvxEdidUploadRequest(name, legacy);
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      form.set(
        "UploadEdid",
        new Blob([Buffer.from(base64, "base64")], {
          type: "application/octet-stream",
        }),
        name,
      );
      const encoded = new Request(`${this.origin}${path}`, {
        method: "POST",
        body: form,
      });
      this.invalidateEdids();
      checkActions(
        await this.json(
          await this.request(path, {
            method: "POST",
            headers: encoded.headers,
            body: new Uint8Array(await encoded.arrayBuffer()),
          }),
        ),
      );
    });
  }
  private invalidateEdids() {
    const objects = { ...this.snapshot.objects };
    delete objects.EdidMgmnt;
    delete objects.AudioVideoInputOutput;
    delete objects.AvioV2;
    this.state = { ...this.state, snapshot: { ...this.snapshot, objects } };
    this.dispatch("driver:state-updated", { data: this.state });
  }
  async deleteEdid(key: string, legacy: boolean): Promise<void> {
    return this.exclusive(async () => {
      await this.readEdids();
      const entry = nvxEdidLibrary(this.snapshot).find(
        (entry) => entry.key === key && entry.type === "Custom",
      );
      if (!entry)
        throw new Error("Choose a custom EDID reported by the device.");
      if (
        typeof legacy !== "boolean" ||
        legacy !== !this.snapshot.objects.EdidMgmnt
      )
        throw new Error("EDID API version does not match this device.");
      if (
        entry.appliedPortsMask ||
        [0, 1].some(
          (input) => nvxCurrentEdid(this.snapshot, input) === entry.name,
        )
      )
        throw new Error(
          "Apply another EDID to all inputs before deleting this EDID.",
        );
      const change = nvxDeleteEdidChange(key, legacy);
      await this.writeSnapshot(change.object, change.patch);
      this.invalidateEdids();
    });
  }
  async downloadOutputEdid(): Promise<{ name: string; base64: string }> {
    return this.exclusive(async () => {
      this.requireConnected();
      const response = await this.request("/edid/sink.cedid");
      if (
        !response.ok ||
        /html/i.test(response.headers.get("content-type") ?? "")
      ) {
        await response.body?.cancel();
        throw new Error(
          "Output EDID download unavailable. Refresh the NVX connection and check the connected display.",
        );
      }
      const bytes = await limitedBytes(response, 32768);
      if (!bytes.length) throw new Error("The device returned an empty EDID.");
      return {
        name: "sink.cedid",
        base64: Buffer.from(bytes).toString("base64"),
      };
    });
  }
  private async configure(build: () => NvxChange): Promise<void> {
    let change: NvxChange;
    try {
      change = build();
    } catch (error) {
      throw new Error(
        error instanceof Error ?
          error.message
        : "Invalid NVX control parameters.",
        { cause: Err.Codes.RpcInvalidParams },
      );
    }
    await this.set(change.object, change.patch);
  }
  async administer(id: string, values: JsonObject): Promise<void> {
    if (id === "subscription-entry")
      return this.exclusive(async () => {
        const snapshot = await this.readSnapshot("XioSubscription");
        const change = nvxSubscriptionEntryChange(
          values,
          snapshot.objects.XioSubscription?.Subscriptions ?? {},
        );
        await this.writeSnapshot("XioSubscription", { Subscriptions: {} });
        await this.writeSnapshot(change.object, change.patch);
      });
    return this.configure(() => nvxAdministrationChange(id, values));
  }
  async initializeUser(username: string, password: string): Promise<void> {
    const validated = nvxAdministrationChange("password", {
      username,
      password,
      currentPassword: password,
    });
    const user = object(validated.patch.CurrentUser);
    return this.exclusive(async () => {
      if (this.authenticated)
        throw new Error(
          "Initial account setup is only for an uninitialized device.",
        );
      checkActions(
        await this.json(
          await this.request("/Device/Authentication", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Referer: `${this.origin}/createUser.html`,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              Device: {
                Authentication: {
                  AuthenticationState: {
                    AdminUsername: user.Name,
                    AdminPassword: user.Password,
                    IsEnabled: true,
                  },
                },
              },
            }),
          }),
        ),
      );
    });
  }
  async uploadAsset(id: string, values: JsonObject): Promise<void> {
    const upload = nvxUploadRequest(id, values);
    return this.exclusive(async () => {
      this.requireConnected();
      const form = new FormData();
      for (const [key, value] of Object.entries(upload.fields))
        form.set(key, value);
      form.set(
        upload.field,
        new Blob([Buffer.from(upload.base64, "base64")], { type: upload.mime }),
        upload.name,
      );
      const encoded = new Request(`${this.origin}${upload.path}`, {
        method: "POST",
        body: form,
      });
      const objects = { ...this.snapshot.objects };
      delete objects[upload.object];
      this.state = { ...this.state, snapshot: { ...this.snapshot, objects } };
      this.dispatch("driver:state-updated", { data: this.state });
      checkActions(
        await this.json(
          await this.request(upload.path, {
            method: "POST",
            headers: encoded.headers,
            body: new Uint8Array(await encoded.arrayBuffer()),
          }),
        ),
      );
    });
  }
  async preview(image: number): Promise<{ base64: string; mime: string }> {
    if (![1, 2, 3].includes(image))
      throw new Error("Choose preview image 1, 2, or 3.");
    return this.exclusive(async () => {
      const snapshot = await this.readSnapshot("Preview");
      const preview = snapshot.objects.Preview!;
      const entry = object(object(preview.ImageList)[`Image${image}`]);
      if (
        preview.IsPreviewOutputEnabled !== true ||
        entry.IsImageAvailable !== true
      )
        throw new Error(
          "Enable preview and wait for an image to become available.",
        );
      const path = new URL(
        String(entry.IPv4Path ?? entry.FQDNPath),
        this.origin,
      );
      // Fetch only the path through this transport; never follow a device-supplied host.
      if (
        path.username ||
        path.password ||
        path.search ||
        !/\.(jpe?g|png)$/i.test(path.pathname) ||
        path.pathname.startsWith("//")
      )
        throw new Error("Unsupported preview image path.");
      const response = await this.request(path.pathname);
      const mime = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
      if (!response.ok || !["image/jpeg", "image/png"].includes(mime)) {
        await response.body?.cancel();
        throw new Error("Preview image unavailable.");
      }
      const bytes = await limitedBytes(response, 4 * 1024 * 1024);
      return { base64: Buffer.from(bytes).toString("base64"), mime };
    });
  }
  async importSubscriptionsXml(xml: string): Promise<void> {
    const subscriptions = nvxSubscriptionsFromXml(xml);
    return this.exclusive(async () => {
      await this.writeSnapshot("XioSubscription", { Subscriptions: {} });
      if (Object.keys(subscriptions).length)
        await this.writeSnapshot("XioSubscription", {
          Subscriptions: subscriptions,
        });
    });
  }
  override api = {
    controls: async (name: NvxObject) => {
      const snapshot = await this.refresh(name);
      return reportedControls(
        name,
        snapshot.objects[name] ?? {},
        this.optionGroups,
      );
    },
    discover: () => this.discover(),
    change: (id: string, value: JsonValue) => this.change(id, value),
    capabilities: async () =>
      (await this.refresh("DeviceCapabilities")).objects.DeviceCapabilities,
    restore: () => this.administer("restore", {}),
    setNetwork: (settings: JsonObject) => this.administer("network", settings),
    setIgmpVersion: (version: "v2" | "v3") =>
      this.administer("igmp", { version }),
    setIpTableEntry: (
      action: "AddEntries" | "RemoveEntries",
      address: string,
      ipId: string,
      program = "",
    ) => this.administer("ip-table", { action, address, ipId, program }),
    setBackground: (settings: JsonObject) =>
      this.administer("background", settings),
    deleteBackground: (slot: number) =>
      this.administer("background-delete", { slot }),
    uploadBackground: (slot: number, name: string, base64: string) =>
      this.uploadAsset("background-upload", { slot, name, base64 }),
    uploadCertificate: (
      store: "Root" | "Intermediate" | "Machine" | "WebServer",
      name: string,
      base64: string,
      password = "",
    ) =>
      this.uploadAsset("certificate-upload", { store, name, base64, password }),
    deleteCertificate: (
      store: "Root" | "Intermediate" | "Machine" | "WebServer",
      name: string,
      uuid: string,
    ) => this.administer("certificate-delete", { store, name, uuid }),
    changePassword: (
      username: string,
      currentPassword: string,
      password: string,
    ) => this.administer("password", { username, currentPassword, password }),
    initializeUser: (username: string, password: string) =>
      this.initializeUser(username, password),
    administer: (id: string, values: JsonObject) => this.administer(id, values),
    uploadAsset: (id: string, values: JsonObject) =>
      this.uploadAsset(id, values),
    preview: (image: number) => this.preview(image),
    importSubscriptionsXml: (xml: string) => this.importSubscriptionsXml(xml),
    exportSubscriptionsXml: async () => {
      const snapshot = await this.refresh("XioSubscription");
      const subscriptions = snapshot.objects.XioSubscription?.Subscriptions;
      assertJsonObject(subscriptions);
      return nvxSubscriptionsToXml(subscriptions);
    },
    connect: () => this.login(),
    disconnect: () => this.logout(),
    refresh: (name: NvxObject) => this.refresh(name),
    refreshEdids: () => this.refreshEdids(),
    uploadEdid: (name: string, base64: string, legacy: boolean) =>
      this.uploadEdid(name, base64, legacy),
    deleteEdid: (key: string, legacy: boolean) => this.deleteEdid(key, legacy),
    downloadOutputEdid: () => this.downloadOutputEdid(),
    readSubscriptions: async () => {
      const snapshot = await this.refresh("XioSubscription");
      return structuredClone(
        snapshot.objects.XioSubscription?.Subscriptions ?? {},
      );
    },
    setSubscriptions: (subscriptions: JsonObject) =>
      this.configure(() => nvxSubscriptionsChange(subscriptions)),
    clearSubscriptions: () => this.configure(() => nvxSubscriptionsChange({})),
    set: (name: NvxObject, patch: JsonObject) => this.set(name, patch),
    setMode: (mode: "Transmitter" | "Receiver") => this.control("mode", mode),
    setVideoSource: (source: "None" | "Input1" | "Input2" | "Stream") =>
      this.control("video", source),
    setLeds: (enabled: boolean) => this.control("leds", enabled),
    control: (id: string, value: JsonValue) => this.control(id, value),
    applyEdid: (
      input: 0 | 1,
      name: string,
      type: "System" | "Custom" | "Auto",
      avioV2: boolean,
    ) => this.configure(() => nvxEdidChange(input, name, type, avioV2)),
    setHdcpCapability: (
      input: 0 | 1,
      capability: "Disabled" | "Auto" | "HDCP14" | "HDCP22",
      avioV2: boolean,
    ) => this.configure(() => nvxHdcpChange(input, capability, avioV2)),
    setScaler: (index: number, avioV2: boolean) =>
      this.configure(() => nvxScalerChange(index, avioV2)),
    setNax: (
      direction: "Tx" | "Rx",
      streamId: string,
      action: "start" | "stop" | "auto" | "address" | "port" | "name",
      value: JsonValue,
    ) =>
      this.exclusive(async () => {
        const change = nvxNaxChange(direction, streamId, action, value);
        const audio = (await this.readSnapshot("NaxAudio")).objects.NaxAudio;
        const section = object(audio?.[`Nax${direction}`]);
        // Firmware documentation uses both NaxTxStreams and TxStreams.
        const key = [`Nax${direction}Streams`, `${direction}Streams`].find(
          (candidate) => Object.hasOwn(object(section[candidate]), streamId),
        );
        if (!key)
          throw new Error(
            `Device did not report ${direction} stream ${streamId}.`,
          );
        const patch = object(change.patch[`Nax${direction}`]);
        await this.writeSnapshot("NaxAudio", {
          [`Nax${direction}`]: { [key]: patch[`Nax${direction}Streams`] },
        });
      }),
  };
}

export function redactDeviceData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeviceData);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/password|passwd|username|secret|token|community|credential|privatekey|devicekey/i.test(
              key,
            ),
        )
        .map(([key, child]) => [key, redactDeviceData(child)]),
    );
  if (typeof value === "string" && /^(?:https?|rtsp):\/\//i.test(value)) {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      url.search = "";
      return url.toString();
    } catch {
      return "[unparseable URL]";
    }
  }
  return value;
}
