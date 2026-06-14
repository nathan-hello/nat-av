import { Driver, Manager } from "@av/drivers";
import type { Drivers, Schema } from "@av/types";
import { describe } from "node:test";

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

  leftManager.GetDriver("left-deferred").state.synced;
  leftManager.GetDriver("left-deferred").syncRightPeer();
  leftManager.GetDriver("right-peer").api.bump();
  leftManager.GetDriver("left-deferred").GetRightDeferredSyncedState();
  rightManager.GetDriver("right-deferred").state.synced;
  rightManager.GetDriver("right-deferred").syncLeftPeer();
  rightManager.GetDriver("left-peer").api.bump();
  pairedManager.GetDriver("left-peer").api.bump();
  pairedManager.GetDriver("right-peer").api.bump();
});
