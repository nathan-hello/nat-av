import { Driver, Manager } from "@av/drivers";
import type { Drivers } from "@av/types";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

class Child<const N extends string = string> extends Driver<N> {
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
> extends Driver<N, D> {
  state = { ready: true };
  api = {
    setLeafReady: <N extends Drivers.Names<D>>(name: N, b: boolean) => {
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

const child1 = new Child("child-1");
const child2 = new Child("child-2");
const parent = new Parent("parent-1", [child1, child2]);
const natav = new Manager({
  drivers: [parent] as const,
  deferred: [] as const,
});
type natav = typeof natav;

describe("driver deps", () => {
  it("exposes named deps and lifts them into natav lookup", () => {
    const asdf = natav.GetDriver("child-1");
    const derivative1 = parent.dep("child-1");
    const derivative2 = parent.dep("child-2");
    assert.equal(derivative1, child1);
    assert.equal(derivative2, child2);
    assert.equal(asdf, child1);
    assert.equal(natav.GetDriver("child-2"), child2);
    assert.deepEqual(natav.GetAllDriverNames(), [
      "parent-1",
      "child-1",
      "child-2",
    ]);
  });
});
