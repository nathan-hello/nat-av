import { Natav } from "../drivers/index.js";
import { Test } from "./data.test.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

  class ParentPeer extends Natav.Driver<"parent-peer", { ready: boolean }, [ChildPeer]> {
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

  type _ = Test.Assert<Test.Equal<names, "parent-peer" | "child-peer">>;
  type __ = Test.Assert<Test.NotEqual<names, string>>;

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

      assert.equal(
        leftManager.plugin["left-plugin"].name,
        "left-plugin",
      );
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
