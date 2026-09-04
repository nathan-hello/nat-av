import { Driver } from "@nat-av/core";

export class CustomDriver extends Driver<"custom"> {
  state = { online: false };
  api = {
    setOnline: (online: boolean) => {
      this.state.online = online;
      this.dispatch("driver:state-updated", { data: this.state });
    },
  };
}
