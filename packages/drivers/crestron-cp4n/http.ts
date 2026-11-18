import { Natav } from "@nat-av/core";

export type DeviceEndpoint = {
  host: string;
  httpsPort: number;
  username: string;
  password: string;
  allowSelfSigned: boolean;
};
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type Transport = { fetch: Fetcher; close: () => void };
export type TransportFactory = (endpoint: DeviceEndpoint) => Transport;

export async function limitedBytes(
  response: Response,
  maximum = 2 * 1024 * 1024,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new Error("Processor response exceeded the size limit.");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maximum)
        throw new Error("Processor response exceeded the size limit.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function limitedText(
  response: Response,
  maximum = 2 * 1024 * 1024,
) {
  return new TextDecoder().decode(await limitedBytes(response, maximum));
}

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    // TSAS: The guard excludes null, arrays and primitives before indexing JSON.
    ? (value as Record<string, unknown>)
    : {};
}

export function checkActions(value: unknown): void {
  const actions = object(value).Actions;
  if (!Array.isArray(actions) || !actions.length)
    throw new Error(
      "The device did not return action results. Read state before retrying.",
    );
  for (const action of actions) {
    const results = object(action).Results;
    if (
      !Array.isArray(results) ||
      !results.length ||
      results.some((result) => object(result).StatusId !== 0)
    )
      throw new Error(
        "The device rejected an API action. Read state before retrying; no retry was attempted.",
      );
  }
}

/** HTTP session, not a persistent connection. start() never accesses the network. */
export abstract class CrestronHttpDriver<
  const Name extends string = string,
  State extends { connected: boolean } = { connected: boolean },
> extends Natav.Driver<Name, State> {
  abstract state: State;
  readonly origin: string;
  private cookies = new Map<string, string>();
  private xsrf = "";
  private transport?: Transport;
  private abort = new AbortController();
  private pending = false;
  protected endpoint: DeviceEndpoint;
  private factory: () => Transport;
  private requireXsrf: boolean;

  constructor(
    name: Name,
    endpoint: DeviceEndpoint,
    factory: () => Transport,
    requireXsrf = true,
  ) {
    super({ name });
    this.endpoint = endpoint;
    this.factory = factory;
    this.requireXsrf = requireXsrf;
    this.origin = new URL(
      `https://${endpoint.host}:${endpoint.httpsPort}`,
    ).origin;
  }

  get authenticated() {
    return this.state.connected;
  }
  override start() {
    /* Registering a driver does not connect it. */
  }
  override end() {
    this.close();
  }
  private publish(connected: boolean) {
    this.state = { ...this.state, connected };
    this.dispatch("driver:state-updated", { data: this.state });
  }
  protected async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending) throw new Error("A device request is already running.");
    this.pending = true;
    try {
      return await work();
    } finally {
      this.pending = false;
    }
  }
  protected async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    this.transport ??= this.factory();
    const headers = new Headers(init.headers);
    headers.set("Origin", this.origin);
    if (!headers.has("Referer"))
      headers.set("Referer", `${this.origin}/userlogin.html`);
    headers.set(
      "Cookie",
      [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    );
    if (init.method === "POST" && path !== "/userlogin.html") {
      if (this.requireXsrf && !this.xsrf)
        throw new Error(
          "No XSRF token is available. Authenticate HTTPS again before changing settings.",
        );
      if (this.xsrf) headers.set("X-CREST-XSRF-TOKEN", this.xsrf);
    }
    let response: Response;
    try {
      response = await this.transport.fetch(`${this.origin}${path}`, {
        ...init,
        headers,
        redirect: "manual",
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(15_000),
        ]),
      });
    } catch (error) {
      this.close();
      throw error;
    }
    // A cancelled request must not restore cookies or connection state.
    if (this.abort.signal.aborted) {
      await response.body?.cancel();
      throw new Error("Device disconnected.");
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0],
        equals = pair.indexOf("=");
      if (equals > 0) {
        const key = pair.slice(0, equals),
          value = pair.slice(equals + 1);
        if (value) this.cookies.set(key, value);
        else this.cookies.delete(key);
      }
    }
    const xsrf = response.headers.get("CREST-XSRF-TOKEN");
    if (xsrf) this.xsrf = xsrf;
    if ([401, 403].includes(response.status)) {
      this.clear();
      await response.body?.cancel();
      throw new Error(
        "Authentication failed or expired. Check credentials and authenticate HTTPS again.",
      );
    }
    return response;
  }
  async login(credentials?: () => Promise<Pick<DeviceEndpoint, "username" | "password">>): Promise<void> {
    return this.exclusive(async () => {
      this.close();
      this.abort = new AbortController();
      try {
        const initial = await this.request("/userlogin.html");
        await initial.body?.cancel();
        if (![200, 302, 303].includes(initial.status))
          throw new Error(`Login page returned HTTP ${initial.status}.`);
        const { username, password } = credentials ? await credentials() : this.endpoint;
        const response = await this.request("/userlogin.html", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            login: username,
            passwd: password,
          }),
        });
        await response.body?.cancel();
        const redirect = response.headers.get("location");
        if (
          ![200, 302, 303].includes(response.status) ||
          (redirect && redirect !== "/" && redirect !== `${this.origin}/`)
        )
          throw new Error(
            "The processor did not accept the login. Check credentials and firmware compatibility.",
          );
        if (
          (this.requireXsrf && !this.xsrf) ||
          !this.cookies.has("userstr") ||
          !this.cookies.has("userid")
        )
          throw new Error(
            "The login response lacked authentication cookies or an XSRF token. This firmware may use a different authentication protocol.",
          );
        this.publish(true);
      } catch (error) {
        this.close();
        throw error;
      }
    });
  }
  async logout(): Promise<void> {
    return this.exclusive(async () => {
      try {
        if (this.authenticated) {
          const response = await this.request("/logout");
          await response.body?.cancel();
          if (![200, 302, 303].includes(response.status))
            throw new Error(
              `Logout returned HTTP ${response.status}. Local cookies have still been cleared.`,
            );
        }
      } finally {
        this.close();
      }
    });
  }
  protected async readObject(name: string): Promise<unknown> {
    return this.exclusive(() => this.readDeviceObject(name));
  }
  /** Caller holds the request lock through decoding and state publication. */
  protected async readDeviceObject(name: string): Promise<unknown> {
    this.requireConnected();
    const result = await this.json(await this.request(`/Device/${name}/`));
    this.requireConnected();
    return result;
  }
  protected async writeObject(
    name: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    return this.exclusive(() => this.writeDeviceObject(name, patch));
  }
  /** Caller holds the request lock through cache invalidation and dispatch. */
  protected async writeDeviceObject(
    name: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.requireConnected();
    checkActions(
      await this.json(
        await this.request("/Device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Device: { [name]: patch } }),
        }),
      ),
    );
  }
  protected requireConnected() {
    if (!this.authenticated)
      throw new Error(
        "Authenticate HTTPS first. Reading inventory does not log in automatically.",
      );
  }
  protected async json(response: Response): Promise<unknown> {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Native API returned HTTP ${response.status}. Verify the device firmware and account permissions.`,
      );
    }
    let result: unknown;
    try {
      result = JSON.parse(await limitedText(response));
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.close();
        throw new Error(
          "The processor returned HTML or invalid JSON instead of API data. Authenticate again or check API support.",
        );
      }
      throw error;
    }
    if (!Object.keys(object(result)).length)
      throw new Error("The processor returned an empty API response.");
    return result;
  }
  clear() {
    this.cookies.clear();
    this.xsrf = "";
    this.publish(false);
  }
  close() {
    this.abort.abort();
    this.clear();
    this.transport?.close();
    this.transport = undefined;
  }
  api = { connect: () => this.login(), disconnect: () => this.logout() };
}
