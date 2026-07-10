import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const VALIDATE_DIR = new URL("../output/validate/", import.meta.url);
const BATCH_SIZE = 250;

async function filesIn(directory: URL): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = new URL(entry.name, directory);
      if (entry.isDirectory())
        return filesIn(new URL(`${entry.name}/`, directory));
      return entry.isFile() && entry.name.endsWith(".ts") ?
          [file.pathname]
        : [];
    }),
  );
  return files.flat();
}

function diagnosticsMessage(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}

async function main(): Promise<void> {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ".");
  const files = await filesIn(VALIDATE_DIR);

  for (let index = 0; index < files.length; index += BATCH_SIZE) {
    const batch = files.slice(index, index + BATCH_SIZE);
    const program = ts.createProgram({
      rootNames: batch,
      options: { ...parsed.options, noEmit: true },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      throw new Error(diagnosticsMessage(diagnostics));
    }
  }

  console.log(`validated ${files.length} schema endpoints`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void main().then(() => process.exit(0));
}
