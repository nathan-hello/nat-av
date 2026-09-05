import * as readline from "node:readline";

export type ReplCommand = (
  args: string[],
) => string | void | Promise<string | void>;

export type ReplCommands = Record<string, ReplCommand>;

export interface ReplOptions {
  prompt: string;
  commands: ReplCommands;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export interface Repl {
  run(): Promise<void>;
  close(): void;
}

const parseArgs = (line: string): string[] => {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];

    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      started = true;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        args.push(current);
        current = "";
        started = false;
      }
    } else {
      current += character;
      started = true;
    }
  }

  if (started) {
    args.push(current);
  }

  return args;
};

export const createRepl = ({
  prompt,
  commands,
  input = process.stdin,
  output = process.stdout,
}: ReplOptions): Repl => {
  let readlineInterface: readline.Interface | undefined;
  let started = false;
  let closed = false;

  const writeLine = (line: string) => {
    output.write(`${line}\n`);
  };

  const close = () => {
    closed = true;
    readlineInterface?.close();
  };

  const run = async () => {
    if (started) {
      throw new Error("REPL has already been run");
    }
    started = true;

    if (closed) {
      return;
    }

    const repl = readline.createInterface({ input, output, prompt });
    readlineInterface = repl;
    repl.prompt();

    try {
      for await (const line of repl) {
        const [name, ...args] = parseArgs(line.trim());
        if (name === undefined) {
          repl.prompt();
          continue;
        }

        const commandName = name.toLowerCase();
        if (commandName === "exit" || commandName === "quit") {
          writeLine("bye");
          break;
        }

        try {
          const command = commands[commandName];
          if (command !== undefined) {
            const result = await command(args);
            if (typeof result === "string") {
              writeLine(result);
            }
          } else if (commandName === "help") {
            const names = Object.keys(commands).sort();
            writeLine(
              `Commands:\n${names.map((command) => `  ${command}`).join("\n")}\n  help\n  exit | quit`,
            );
          } else {
            writeLine(
              `Unknown command: ${name}. Type 'help' for available commands.`,
            );
          }
        } catch (error) {
          writeLine(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (!closed) {
          repl.prompt();
        }
      }
    } finally {
      closed = true;
      repl.close();
      readlineInterface = undefined;
    }
  };

  return { run, close };
};
