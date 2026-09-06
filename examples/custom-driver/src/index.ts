import { Driver } from "@nat-av/core";

type FooState = { bool: boolean, num: number, str: string }

export class Foo extends Driver<"custom"> {
  state = { bool: false, num: 0, str: "" };
  api = {
    toggle: () => {
      this.state.bool = !this.state.bool;
      this.dispatch("driver:state-updated", {
        data: { bool: this.state },
      });
    },
  };
}
