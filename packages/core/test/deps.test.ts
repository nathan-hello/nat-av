import { Natav } from "../drivers/index.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true
  : false;

class Child<const N extends string = string> extends Natav.Driver<N> {
  state = { ready: true };
  api = {
    setReady: (b: boolean) => {
      this.state.ready = b;
      this.dispatch("driver:state-updated", { data: this.state });
    },
  };

  constructor(name: N) {
    super({ name });
  }
}

class Parent<
  const N extends string,
  const D extends readonly Child[],
> extends Natav.Driver<N, { ready: boolean }, D> {
  state = { ready: true };
  api = {
    setLeafReady: <N extends Natav.Names<D>>(name: N, b: boolean) => {
      const child = this.dep(name);
      child.api.setReady(b);
      const ready = this.deps.every((d) => d.state.ready === true);
      const flip = ready !== this.state.ready;
      if (flip) {
        this.state.ready = !this.state.ready;
      }
      this.dispatch("driver:state-updated", { data: this.state });
    },
  };

  constructor(name: N, deps: D) {
    super({ name, deps });
  }
}

class Decoder extends Natav.Driver<"decoder"> {
  state = {};
  api = { decode: (value: string) => value };

  constructor() {
    super({ name: "decoder" });
  }
}

class Encoder extends Natav.Driver<"encoder"> {
  state = {};
  api = { encode: (value: string) => value };

  constructor() {
    super({ name: "encoder" });
  }
}

class ManagedPlugin extends Natav.Driver<
  "managed-plugin",
  {},
  [Child<"child-1">]
> {
  state = {};
  api = { inspect: () => "plugin" };

  constructor(child: Child<"child-1">) {
    super({ name: "managed-plugin", deps: [child] });
  }
}

class Codec extends Natav.Driver<"codec", {}, readonly (Decoder | Encoder)[]> {
  state = {};
  api = {};

  constructor(decoders: Decoder[], encoders: Encoder[]) {
    super({ name: "codec", deps: [...decoders, ...encoders] });
  }
}

const codec = new Codec([new Decoder()], [new Encoder()]);
const mixedDecoder = codec.dep("decoder");
const mixedEncoder = codec.dep("encoder");
type _mixedDecoder = Assert<Equal<typeof mixedDecoder, Decoder>>;
type _mixedEncoder = Assert<Equal<typeof mixedEncoder, Encoder>>;
type _remoteDecoderApi = Assert<
  Equal<
    ReturnType<Natav.PromisifyApi<Decoder["api"]>["decode"]>,
    Promise<string>
  >
>;

const child1 = new Child("child-1");
const child2 = new Child("child-2");
const managedPlugin = new ManagedPlugin(child1);
type ManagedEntries = Natav.ManagedResolved<[typeof managedPlugin]>;
type _managedNames = Assert<
  Equal<Natav.ManagedNames<ManagedEntries>, "managed-plugin" | "child-1">
>;
type _managedPlugin = Assert<
  Equal<
    Natav.ManagedCatalog<[typeof managedPlugin]>["managed-plugin"],
    ManagedPlugin
  >
>;

const parent = new Parent("parent-1", [child1, child2]);
const natav = new Natav({
  drivers: [parent] as const,
  plugin: [] as const,
});
type natav = typeof natav;

type DriverNames = Natav.Names<natav["drivers"]>;
type _driverNames = Assert<
  Equal<DriverNames, "parent-1" | "child-1" | "child-2">
>;
type _childLookup = Assert<Equal<natav["driver"]["child-1"], Child<"child-1">>>;

const runtimeName: string = "runtime-child";
const runtimeChildren = [new Child(runtimeName)];
const runtimeManager = new Natav({
  drivers: runtimeChildren,
  plugin: [] as const,
});
type RuntimeManager = typeof runtimeManager;
type RuntimeNames = Natav.Names<RuntimeManager["drivers"]>;
type _runtimeNames = Assert<Equal<RuntimeNames, string>>;
type RuntimeLookup = Natav.FromName<
  RuntimeManager["drivers"],
  "any-runtime-name"
>;
type _runtimeLookup = Assert<
  RuntimeLookup extends Child<string> ? true : false
>;

const runtimeLookup = runtimeManager.GetDriver(runtimeName);
type _runtimeManagerLookup = Assert<
  typeof runtimeLookup extends Child<string> ? true : false
>;

const pluginManager = new Natav({
  drivers: [] as const,
  plugin: [() => managedPlugin] as const,
});
type PluginManager = typeof pluginManager;
type _pluginDependency = Assert<
  Equal<PluginManager["driver"]["child-1"], Child<"child-1">>
>;

// @ts-expect-error Unknown names must not be accepted by the manager catalog.
if (false) natav.GetDriver("missing");

// @ts-expect-error Unknown names must not be accepted by local dependency lookup.
if (false) parent.dep("missing");

describe("driver deps", () => {
  it("exposes named deps and lifts them into natav lookup", () => {
    const asdf = natav.GetDriver("child-1");
    const derivative1 = parent.dep("child-1");
    const derivative2 = parent.dep("child-2");
    assert.equal(derivative1, child1);
    assert.equal(derivative2, child2);
    assert.equal(asdf, child1);
    assert.equal(natav.GetDriver("child-2"), child2);
    assert.equal(natav.driver["child-1"], child1);
    assert.deepEqual(natav.GetAllDriverNames(), [
      "parent-1",
      "child-1",
      "child-2",
    ]);
  });

  it("initializes a shared dependency once when it appears below multiple roots", async () => {
    let starts = 0;

    class Shared extends Natav.Driver<"shared"> {
      state = {};
      api = {};

      constructor() {
        super({ name: "shared" });
      }
      override start() {
        starts++;
      }
    }

    class Branch<const N extends "left" | "right"> extends Natav.Driver<
      N,
      {},
      readonly [Shared]
    > {
      state = {};
      api = {};

      constructor(name: N, shared: Shared) {
        super({ name, deps: [shared] });
      }
    }

    const shared = new Shared();
    const manager = new Natav({
      drivers: [
        new Branch("left", shared),
        new Branch("right", shared),
      ] as const,
      plugin: [] as const,
    });

    await manager.Start();
    assert.equal(starts, 1);
  });

  it("keeps the managed driver contract when names come from runtime configuration", () => {
    assert.equal(runtimeManager.GetDriver(runtimeName).name, runtimeName);
    assert.deepEqual(runtimeManager.GetAllDriverNames(), [runtimeName]);
  });

  it("keeps plugin dependencies in the driver catalog", async () => {
    assert.equal(pluginManager.plugin["managed-plugin"], managedPlugin);
    assert.equal(pluginManager.driver["child-1"], child1);
    assert.equal(pluginManager.plugins[0], managedPlugin);
    assert.equal(pluginManager.Get("managed-plugin"), managedPlugin);
    assert.equal(pluginManager.Get("child-1"), child1);

    await pluginManager.Start();
  });
});
