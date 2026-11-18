import type { SimulatedDeviceConfig } from "@nat-av/driver-dante-router";

const numbered = (count: number, prefix = "") =>
  Array.from(
    { length: count },
    (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`,
  );

// TX entries may carry a friendly label after "|".
export const simulatedDevices: SimulatedDeviceConfig[] = [
  {
    name: "Stage-Rack",
    tx: [
      "01|Kick",
      "02|Snare",
      "03|Hat",
      "04|Tom",
      "05|Bass DI",
      "06|Gtr",
      "07|Keys L",
      "08|Keys R",
    ],
    rx: numbered(4, "Mon "),
    subscriptions: {
      1: { txDevice: "FOH-Console", txChannel: "Mix-1" },
      2: { txDevice: "FOH-Console", txChannel: "Mix-2" },
    },
  },
  {
    name: "Wireless-Rx",
    tx: ["Vox-1|Lead Vox", "Vox-2|BV 1", "Vox-3|BV 2", "Vox-4|Host"],
    rx: [],
  },
  {
    name: "FOH-Console",
    tx: ["Main-L", "Main-R", "Mix-1", "Mix-2"],
    rx: numbered(16, "Ch "),
    subscriptions: {
      1: { txDevice: "Stage-Rack", txChannel: "01" },
      2: { txDevice: "Stage-Rack", txChannel: "02" },
      9: { txDevice: "Wireless-Rx", txChannel: "Vox-1" },
      // A source that is not on the network shows as unresolved.
      16: { txDevice: "Playback-PC", txChannel: "01" },
    },
  },
  {
    name: "Amp-Rack",
    tx: [],
    rx: ["Left", "Right", "Sub"],
    sampleRate: 48000,
    subscriptions: {
      1: { txDevice: "FOH-Console", txChannel: "Main-L" },
      2: { txDevice: "FOH-Console", txChannel: "Main-R" },
    },
  },
];
