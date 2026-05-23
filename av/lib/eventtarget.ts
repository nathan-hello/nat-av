import { Telemetry } from "@av/telemetry";

export class TypedEventTarget<
  Events extends Record<string, any> = Record<string, any>,
> extends EventTarget {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private offCallbacks: (() => void)[] = [];
  constructor(private _tet_tel = new Telemetry("EventEmitter")) {
    super();
  }

  on<K extends keyof Events>(
    type: K & string,
    handler: (payload: Events[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) {
        try {
          handler(event.detail);
        } catch (err) {
          if (type !== "natav:opentelemetry:entry") {
            this._tet_tel.error(`LISTENER_ERROR:${type}`, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    };

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    super.addEventListener(type, listener, options);

    // this arrow function is necessary for `super` closure.
    const cleanup = () => {
      super.removeEventListener(type, listener, options);
      this.listeners.get(type)?.delete(listener);
    };

    this.offCallbacks.push(cleanup);

    return cleanup;
  }

  end() {
    this.offCallbacks.forEach((func) => func());
  }

  once<K extends keyof Events>(
    type: K & string,
    options?: { signal?: AbortSignal },
  ): Promise<Events[K]> {
    return new Promise<Events[K]>((resolve, reject) => {
      const listener = (event: Event) => {
        if (event instanceof CustomEvent) resolve(event.detail);
      };

      options?.signal?.addEventListener(
        "abort",
        () => {
          super.removeEventListener(type, listener);
          reject(options.signal?.reason);
        },
        { once: true },
      );

      super.addEventListener(type, listener, { once: true });
    });
  }

  dispatch<K extends keyof Events>(type: K, payload: Events[K]): void {
    // TSAS:
    super.dispatchEvent(new CustomEvent(type as string, { detail: payload }));
  }
}

export class ProtectedTypedEventTarget<
  Events extends Record<string, any> = Record<string, any>,
> extends EventTarget {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private offCallbacks: (() => void)[] = [];

  constructor(private _tet_tel = new Telemetry("EventEmitter")) {
    super();
  }

  on<K extends keyof Events>(
    type: K & string,
    handler: (payload: Events[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) {
        // Skip telemetry for opentelemetry events to avoid infinite loop
        if (type === "natav:opentelemetry:entry") {
          handler(event.detail);
          return;
        }
        try {
          handler(event.detail);
        } catch (err) {
          this._tet_tel.error(`LISTENER_ERROR:${type}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    super.addEventListener(type, listener, options);

    // this arrow function is necessary for `super` closure.
    const cleanup = () => {
      super.removeEventListener(type, listener, options);
      this.listeners.get(type)?.delete(listener);
    };

    this.offCallbacks.push(cleanup);

    return cleanup;
  }

  protected end() {
    this.offCallbacks.forEach((func) => func());
  }

  protected dispatch<K extends keyof Events>(
    type: K,
    payload: Events[K],
  ): void {
    // TSAS:
    const event = new CustomEvent(type as string, { detail: payload });
    super.dispatchEvent(event);
  }
}
