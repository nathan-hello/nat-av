import { Driver } from "@nat-av/core";

type FooState = { bool: boolean; num: number; str: string };

export class Foo<const N extends string> extends Driver<N, FooState> {
  constructor(name: N) {
    super({ name: name });
  }
  state = { bool: false, num: 0, str: "" };
  api = {
    toggle: () => {
      this.state.bool = !this.state.bool;
      this.dispatch("driver:state-updated", {
        data: { bool: this.state.bool },
      });
    },
    square: (n: number) => {
      this.state.num = n * n;
      this.dispatch("driver:state-updated", { data: { num: this.state.num } });
    },
    reverse: (s: string) => {
      this.state.str = [...s].reverse().join("");
      this.dispatch("driver:state-updated", { data: { str: this.state.str } });
    },
  };
}
