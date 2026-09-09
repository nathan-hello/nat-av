import { Natav } from "../drivers/index.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true
  : false;
type NotEqual<A, B> = Equal<A, B> extends true ? false : true;

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

class RuntimePlugin extends Natav.Plugin<"runtime-plugin"> {
  state = { added: false };
  api = {};

  constructor(private readonly manager: Natav) {
    super({ name: "runtime-plugin" });
  }

  add(driver: Natav.Shape, groups: readonly string[] = []) {
    return this.manager.AddDriver(driver, groups);
  }

  remove(name: string) {
    return this.manager.RemoveDriver(name);
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

  it("flattens nested runtime-driven groups and preserves stable membership", () => {
    const roomA = new Child("room-a");
    const roomB = new Child("room-b");
    const runtime = new Natav({
      drivers: [
        {
          rooms: {
            a: [roomA],
            b: [roomB],
          },
        },
      ],
      plugin: [],
    });

    assert.deepEqual(runtime.GetAllGroupPaths(), [
      "/rooms/a",
      "/rooms/b",
      "/rooms",
    ]);
    assert.deepEqual(runtime.FindGroup("/rooms/a"), [roomA]);
    assert.deepEqual(runtime.FindGroup("/rooms"), [roomA, roomB]);
    assert.equal(runtime.GetDriver("room-a"), roomA);
    assert.equal(runtime.GetDriver("room-b"), roomB);
  });

  it("allows a plugin to add and remove runtime drivers after assembly", async () => {
    const manager = new Natav({
      drivers: [],
      plugin: [RuntimePlugin],
    });
    const plugin = manager.Get("runtime-plugin");
    const dynamic = new Child("dynamic-child");

    await manager.Start();
    assert.equal(manager.FindDriver("dynamic-child"), undefined);
    // TSAS: The runtime plugin name resolves to the concrete test plugin.
    await (plugin as RuntimePlugin).add(dynamic);
    assert.equal(manager.Get("dynamic-child"), dynamic);
    await manager.RemoveDriver("dynamic-child");
    assert.equal(manager.FindDriver("dynamic-child"), undefined);
  });

  it("accepts nested runtime-driven plugin groups", () => {
    const manager = new Natav({
      drivers: [],
      plugin: [{ tooling: [RuntimePlugin] }],
    });

    assert.deepEqual(manager.GetAllPluginNames(), ["runtime-plugin"]);
    assert.deepEqual(
      manager.FindGroup("/tooling")?.map((entry) => entry.name),
      ["runtime-plugin"],
    );
  });

  it("starts and ends a driver introduced by a running plugin", async () => {
    let starts = 0;
    let ends = 0;
    class LifecycleDriver extends Natav.Driver<"lifecycle"> {
      state = {};
      api = {};
      override start() {
        starts++;
      }
      override end() {
        ends++;
      }
      constructor() {
        super({ name: "lifecycle" });
      }
    }

    const manager = new Natav({ drivers: [], plugin: [RuntimePlugin] });
    // TSAS: The runtime plugin name resolves to the concrete test plugin.
    const plugin = manager.Get("runtime-plugin") as RuntimePlugin;
    await manager.Start();
    await plugin.add(new LifecycleDriver());
    assert.equal(starts, 1);
    await manager.RemoveDriver("lifecycle");
    assert.equal(ends, 1);
  });

  it("creates runtime groups without partially mutating the catalog", async () => {
    const manager = new Natav({ drivers: [], plugin: [] });
    const dynamic = new Child("dynamic-invalid");

    await manager.AddDriver(dynamic, ["missing", "group"]);
    assert.equal(manager.FindDriver("dynamic-invalid"), dynamic);
    assert.deepEqual(manager.FindGroup("/missing/group"), [dynamic]);

    await assert.rejects(
      manager.AddDriver(new Child("dynamic-invalid")),
      /multiple managed entries/,
    );
    assert.equal(manager.FindDriver("dynamic-invalid"), dynamic);
  });
});


describe("typechecking that drivers can get Managers that have other drivers in them", async () => {
  class LeftPeer extends Natav.Driver<"left-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    constructor() {
      super({ name: "left-peer" });
    }
  }

  class RightPeer extends Natav.Driver<"right-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    constructor() {
      super({ name: "right-peer" });
    }
  }

  class LeftPlugin extends Natav.Driver<"left-plugin"> {
    state = { synced: false };
    api = {};
    socket = undefined;
    natav: Natav.ManagerView<readonly [RightPeer]> & {
      readonly plugin: Natav.Catalog<readonly [RightPlugin]>;
    };

    constructor(
      natav: Natav.ManagerView<readonly [RightPeer]> & {
        readonly plugin: Natav.Catalog<readonly [RightPlugin]>;
      },
    ) {
      super({ name: "left-plugin" });
      this.natav = natav;
    }

    syncRightPeer() {
      this.natav.GetDriver("right-peer").api.bump();
      this.natav.GetDriver("right-peer").state.count;
    }

    GetRightPluginSyncedState() {
      return this.natav.plugin["right-plugin"].state.synced;
    }
  }

  class RightPlugin extends Natav.Driver<"right-plugin"> {
    state = { synced: false };
    api = {};
    socket = undefined;

    constructor(natav: Natav.ManagerView<readonly [LeftPeer]>) {
      super({ name: "right-plugin" });
      this.natav = natav;
    }

    natav: Natav.ManagerView<readonly [LeftPeer]>;

    syncLeftPeer() {
      this.natav.GetDriver("left-peer").state.count;
    }
  }

  class ChildPeer extends Natav.Driver<"child-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    constructor() {
      super({ name: "child-peer" });
    }
  }

  class ParentPeer extends Natav.Driver<
    "parent-peer",
    { ready: boolean },
    [ChildPeer]
  > {
    state = { ready: true };
    api = {};
    socket = undefined;

    constructor(child: ChildPeer) {
      super({ name: "parent-peer", deps: [child] });
    }
  }

  const leftPeer = new LeftPeer();
  const rightPeer = new RightPeer();

  const leftDrivers: readonly [RightPeer] = [rightPeer];
  const leftPlugins: readonly [typeof LeftPlugin, typeof RightPlugin] = [
    LeftPlugin,
    RightPlugin,
  ];
  const leftManager = new Natav({
    drivers: leftDrivers,
    plugin: leftPlugins,
  });

  const rightDrivers: readonly [LeftPeer] = [leftPeer];
  const rightPlugins: readonly [typeof RightPlugin] = [RightPlugin];
  const rightManager = new Natav({
    drivers: rightDrivers,
    plugin: rightPlugins,
  });

  const pairedDrivers: readonly [LeftPeer, RightPeer] = [leftPeer, rightPeer];
  const noPlugins: readonly [] = [];
  const pairedManager = new Natav({
    drivers: pairedDrivers,
    plugin: noPlugins,
  });

  const childPeer = new ChildPeer();
  const parentPeer = new ParentPeer(childPeer);
  const depManager = new Natav({
    drivers: [parentPeer] as const,
    plugin: [] as const,
  });

  type names = Natav.Names<(typeof depManager)["drivers"]>;

  type _ = Assert<Equal<names, "parent-peer" | "child-peer">>;
  type __ = Assert<NotEqual<names, string>>;

  function expectManager(manager: Natav, names: string[], tree: unknown) {
    assert.deepEqual(manager.GetAllDriverNames(), names);
    names.forEach((n) => {
      assert.equal(manager.FindDriver(n), manager.GetDriver(n));
    });
    assert.deepEqual(manager.GetTree(), tree);
  }

  describe("manager lookup and trees", () => {
    it("works for the left manager", () => {
      leftManager.plugin["left-plugin"].state.synced;
      leftManager.plugin["left-plugin"].syncRightPeer();
      leftManager.GetDriver("right-peer").api.bump();
      leftManager.plugin["left-plugin"].GetRightPluginSyncedState();

      expectManager(
        leftManager,
        ["right-peer"],
        [
          {
            name: "right-peer",
            deps: [],
          },
        ],
      );

      assert.equal(leftManager.plugin["left-plugin"].name, "left-plugin");
      assert.equal(leftManager.plugin["left-plugin"].state.synced, false);
      assert.equal(leftManager.FindDriver("missing"), undefined);
    });

    it("works for the right manager", () => {
      rightManager.plugin["right-plugin"].state.synced;
      rightManager.plugin["right-plugin"].syncLeftPeer();
      rightManager.GetDriver("left-peer").api.bump();

      expectManager(
        rightManager,
        ["left-peer"],
        [
          {
            name: "left-peer",
            deps: [],
          },
        ],
      );

      assert.equal(rightManager.GetDriver("left-peer").name, "left-peer");
      assert.equal(rightManager.GetDriver("left-peer").state.count, 1);
    });

    it("works for the paired manager", () => {
      pairedManager.GetDriver("left-peer").api.bump();
      pairedManager.GetDriver("right-peer").api.bump();

      expectManager(
        pairedManager,
        ["left-peer", "right-peer"],
        [
          {
            name: "left-peer",
            deps: [],
          },
          {
            name: "right-peer",
            deps: [],
          },
        ],
      );

      assert.equal(pairedManager.GetDriver("left-peer").name, "left-peer");
      assert.equal(pairedManager.GetDriver("right-peer").name, "right-peer");
    });

    it("works for a manager with driver deps", () => {
      parentPeer;
      childPeer.api.bump();

      expectManager(
        depManager,
        ["parent-peer", "child-peer"],
        [
          {
            name: "parent-peer",
            deps: [
              {
                name: "child-peer",
                deps: [],
              },
            ],
          },
        ],
      );

      assert.equal(depManager.GetDriver("parent-peer").name, "parent-peer");
      assert.equal(depManager.GetDriver("child-peer").name, "child-peer");
      assert.equal(depManager.GetDriver("child-peer").state.count, 1);
      assert.equal(depManager.FindDriver("child-peer"), childPeer);
      assert.equal(
        depManager.GetDriver("parent-peer").dep("child-peer"),
        childPeer,
      );
    });
  });
});
