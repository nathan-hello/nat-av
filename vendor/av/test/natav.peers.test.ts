import { Driver, Manager } from "@av/drivers";
import type { Drivers, Schema } from "@av/types";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("typechecking that drivers can get Managers that have other drivers in them", async () => {
  class LeftPeer extends Driver<"left-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor() {
      super({ name: "left-peer", driverName: "left-peer" });
    }
  }

  class RightPeer extends Driver<"right-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor() {
      super({ name: "right-peer", driverName: "right-peer" });
    }
  }

  class LeftDeferred extends Driver<"left-deferred"> {
    state = { synced: false };
    api = {};
    socket = undefined;
    natav: Drivers.ManagerView<readonly [RightPeer, RightDeferred]>;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor(
      natav: Drivers.ManagerView<readonly [RightPeer, RightDeferred]>,
    ) {
      super({ name: "left-deferred", driverName: "left-deferred" });
      this.natav = natav;
    }

    syncRightPeer() {
      this.natav.GetDriver("right-peer").api.bump();
      this.natav.GetDriverState("right-peer").count;
    }

    GetRightDeferredSyncedState() {
      return this.natav.GetDriver("right-deferred").state.synced;
    }
  }

  class RightDeferred extends Driver<"right-deferred"> {
    state = { synced: false };
    api = {};
    socket = undefined;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor(natav: Drivers.ManagerView<readonly [LeftPeer]>) {
      super({ name: "right-deferred", driverName: "right-deferred" });
      this.natav = natav;
    }

    natav: Drivers.ManagerView<readonly [LeftPeer]>;

    syncLeftPeer() {
      this.natav.GetDriverState("left-peer").count;
    }
  }

  class ChildPeer extends Driver<"child-peer"> {
    state = { count: 0 };
    api = {
      bump: () => {
        this.state.count += 1;
      },
    };
    socket = undefined;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor() {
      super({ name: "child-peer", driverName: "child-peer" });
    }
  }

  class ParentPeer extends Driver<"parent-peer", { "child-peer": ChildPeer }> {
    state = { ready: true };
    api = {};
    socket = undefined;

    schema = (): Schema.Schema<typeof this.api> => {
      return [];
    };

    constructor(private child: ChildPeer) {
      super({ name: "parent-peer", driverName: "parent-peer" });
      this.deps.set({ "child-peer": this.child });
    }
  }

  const leftPeer = new LeftPeer();
  const rightPeer = new RightPeer();

  const leftDrivers: readonly [RightPeer] = [rightPeer];
  const leftDeferred: readonly [typeof LeftDeferred, typeof RightDeferred] = [
    LeftDeferred,
    RightDeferred,
  ];
  const leftManager = new Manager({
    drivers: leftDrivers,
    deferred: leftDeferred,
  });

  const rightDrivers: readonly [LeftPeer] = [leftPeer];
  const rightDeferred: readonly [typeof RightDeferred] = [RightDeferred];
  const rightManager = new Manager({
    drivers: rightDrivers,
    deferred: rightDeferred,
  });

  const pairedDrivers: readonly [LeftPeer, RightPeer] = [leftPeer, rightPeer];
  const noDeferred: readonly [] = [];
  const pairedManager = new Manager({
    drivers: pairedDrivers,
    deferred: noDeferred,
  });

  const childPeer = new ChildPeer();
  const parentPeer = new ParentPeer(childPeer);
  const depManager = new Manager({
    drivers: [parentPeer] as const,
    deferred: [] as const,
  });

  function expectManager(manager: Manager, names: string[], tree: unknown) {
    assert.deepEqual(manager.GetAllDriverNames(), names);
    names.forEach((n) => {
      assert.equal(manager.FindDriver(n), manager.GetDriver(n));
    });
    assert.deepEqual(manager.GetTree(), tree);
  }

  describe("manager lookup and trees", () => {
    it("works for the left manager", () => {
      leftManager.GetDriver("left-deferred").state.synced;
      leftManager.GetDriver("left-deferred").syncRightPeer();
      leftManager.GetDriver("right-peer").api.bump();
      leftManager.GetDriver("left-deferred").GetRightDeferredSyncedState();

      expectManager(
        leftManager,
        ["right-peer", "left-deferred", "right-deferred"],
        [
          {
            name: "right-peer",
            driverName: "right-peer",
            children: [],
          },
          {
            name: "left-deferred",
            driverName: "left-deferred",
            children: [],
          },
          {
            name: "right-deferred",
            driverName: "right-deferred",
            children: [],
          },
        ],
      );

      assert.equal(
        leftManager.GetDriver("left-deferred").name,
        "left-deferred",
      );
      assert.equal(leftManager.GetDriverState("left-deferred").synced, false);
      assert.equal(leftManager.FindDriver("missing"), undefined);
    });

    it("works for the right manager", () => {
      rightManager.GetDriver("right-deferred").state.synced;
      rightManager.GetDriver("right-deferred").syncLeftPeer();
      rightManager.GetDriver("left-peer").api.bump();

      expectManager(
        rightManager,
        ["left-peer", "right-deferred"],
        [
          {
            name: "left-peer",
            driverName: "left-peer",
            children: [],
          },
          {
            name: "right-deferred",
            driverName: "right-deferred",
            children: [],
          },
        ],
      );

      assert.equal(rightManager.GetDriver("left-peer").name, "left-peer");
      assert.equal(rightManager.GetDriverState("left-peer").count, 1);
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
            driverName: "left-peer",
            children: [],
          },
          {
            name: "right-peer",
            driverName: "right-peer",
            children: [],
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
            driverName: "parent-peer",
            children: [
              {
                name: "child-peer",
                driverName: "child-peer",
                children: [],
              },
            ],
          },
        ],
      );

      assert.equal(depManager.GetDriver("parent-peer").name, "parent-peer");
      assert.equal(depManager.GetDriver("child-peer").name, "child-peer");
      assert.equal(depManager.GetDriverState("child-peer").count, 1);
      assert.equal(depManager.FindDriver("child-peer"), childPeer);
      assert.equal(
        depManager.GetDriver("parent-peer").deps.get("child-peer"),
        childPeer,
      );
    });
  });
});
