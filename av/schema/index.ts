import { fileURLToPath } from "node:url";

import { extractApiSurfaceSchema } from "./extract.ts";

type SchemaGeneratorArgs = {
  entryFile: string | URL;
  exportName?: string;
  rootDir?: string;
  tsConfigFilePath?: string;
};

export class SchemaGenerator {
  readonly entryFile: string;
  readonly exportName: string;
  readonly rootDir?: string;
  readonly tsConfigFilePath?: string;

  constructor(args: SchemaGeneratorArgs) {
    this.entryFile = normalizeEntryFile(args.entryFile);
    this.exportName = args.exportName ?? "natav";
    this.rootDir = args.rootDir;
    this.tsConfigFilePath = args.tsConfigFilePath;
  }

  extract() {
    return extractApiSurfaceSchema({
      entry: this.entryFile,
      exportName: this.exportName,
      rootDir: this.rootDir,
      tsConfigFilePath: this.tsConfigFilePath,
    });
  }

  toJSON() {
    return this.extract();
  }

  render() {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  response() {
    return new Response(this.render(), {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  }
}

function normalizeEntryFile(entryFile: string | URL) {
  if (entryFile instanceof URL) {
    return fileURLToPath(entryFile);
  }

  if (entryFile.startsWith("file:")) {
    return fileURLToPath(entryFile);
  }

  return entryFile;
}
