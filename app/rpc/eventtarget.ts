import type { EventMap } from "@/rpc/types";

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  emit<K extends keyof Events & string, V extends Events[K]>(type: K, value: V) {
    super.dispatchEvent(new CustomEvent(type, value));
  }

  on<K extends keyof Events & string>(
    type: K,
    handler: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    super.addEventListener(type, handler as EventListener, options);
    return this;
  }

  once<K extends keyof Events & string>(
    type: K,
    options?: { signal?: AbortSignal },
  ): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      let cleanup = () => {};

      let listener = (event: Event) => {
        cleanup();
        resolve(event as Events[K]);
      };

      cleanup = () => {
        super.removeEventListener(type, listener as EventListener);
      };

      if (options?.signal?.aborted) {
        reject(options.signal.reason);
        return;
      }

      options?.signal?.addEventListener(
        "abort",
        () => {
          cleanup();
          reject(options.signal?.reason);
        },
        { once: true },
      );

      super.addEventListener(type, listener, { once: true });
    });
  }
}

