import { Driver } from "@av/driver";
import Natav from "@av/natav";
import type { DeviceSocket } from "@av/types";
import { SchemaGenerator } from "@av/schema";

export type Coordinates = {
  x: number;
  y: number;
};

export type Contact = {
  name: string;
  tags: string[];
};

export type Profile = {
  primary: Contact;
  secondary?: Contact;
  origin: Coordinates | null;
};

export type SchemaFixtureState = {
  connected: boolean;
  profile: Profile;
  history: Coordinates[];
};

export type SchemaFixtureApi = {
  ping: () => Promise<string>;
  move: (target: Coordinates, options?: { smooth: boolean; durationMs: number }) => Promise<void>;
  updateProfile: (profile: Profile, revision?: number) => Promise<{
    ok: true;
    profile: Profile;
  }>;
};

class NullSocket implements DeviceSocket {
  name = "NullSocket::schema";

  start() {}

  end() {}

  write() {
    return 0;
  }

  on() {
    return () => {};
  }
}

class SchemaFixtureDriver extends Driver<
  "schema-fixture",
  {},
  "schema-fixture",
  SchemaFixtureApi,
  SchemaFixtureState,
  NullSocket
> {
  state: SchemaFixtureState = {
    connected: false,
    profile: {
      primary: {
        name: "Primary",
        tags: ["alpha"],
      },
      secondary: undefined,
      origin: null,
    },
    history: [],
  };

  socket = new NullSocket();

  api: SchemaFixtureApi = {
    ping: async () => "pong",
    move: async () => {},
    updateProfile: async (profile) => ({ ok: true, profile }),
  };

  constructor() {
    super({ name: "schema-fixture", driverName: "schema-fixture" });
  }
}

export const natav = new Natav([new SchemaFixtureDriver()]);

export const schema = new SchemaGenerator({ entryFile: import.meta.url, exportName: "natav" });
