import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { createRepl } from "./index.js";

const createStreams = () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    text += chunk;
  });
  return { input, output, text: () => text };
};

describe("createRepl", () => {
  it("tokenizes quoted arguments and prints async command results", async () => {
    const streams = createStreams();
    const calls: string[][] = [];
    const repl = createRepl({
      prompt: "test> ",
      ...streams,
      commands: {
        echo: async (args) => {
          calls.push(args);
          await Promise.resolve();
          return args.join("|");
        },
      },
    });

    const running = repl.run();
    streams.input.end('echo "hello world" \'two words\' ""\nexit\n');
    await running;

    assert.deepEqual(calls, [["hello world", "two words", ""]]);
    assert.match(streams.text(), /hello world\|two words\|/);
    assert.match(streams.text(), /bye/);
  });

  it("reports errors and unknown commands without stopping", async () => {
    const streams = createStreams();
    let completed = false;
    const repl = createRepl({
      prompt: "> ",
      ...streams,
      commands: {
        fail: () => {
          throw new Error("broken");
        },
        finish: () => {
          completed = true;
        },
      },
    });

    const running = repl.run();
    streams.input.end("fail\nmissing\nfinish\n");
    await running;

    assert.equal(completed, true);
    assert.match(streams.text(), /Error: broken/);
    assert.match(streams.text(), /Unknown command: missing/);
  });

  it("provides default help and permits custom help", async () => {
    const defaultStreams = createStreams();
    const defaultRepl = createRepl({
      prompt: "> ",
      ...defaultStreams,
      commands: { zebra: () => {}, alpha: () => {} },
    });
    const defaultRunning = defaultRepl.run();
    defaultStreams.input.end("help\n");
    await defaultRunning;

    assert.match(
      defaultStreams.text(),
      /Commands:\n  alpha\n  zebra\n  help\n  exit \| quit/,
    );

    const customStreams = createStreams();
    const customRepl = createRepl({
      prompt: "> ",
      ...customStreams,
      commands: { help: () => "custom help" },
    });
    const customRunning = customRepl.run();
    customStreams.input.end("help\n");
    await customRunning;

    assert.match(customStreams.text(), /custom help/);
  });

  it("closes externally and cannot run twice", async () => {
    const streams = createStreams();
    const repl = createRepl({
      prompt: "> ",
      ...streams,
      commands: {},
    });

    const running = repl.run();
    repl.close();
    await running;
    await assert.rejects(repl.run(), /already been run/);
  });
});
