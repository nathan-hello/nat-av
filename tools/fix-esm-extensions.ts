import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat().filter((path) => path.endsWith(".js"));
}

for (const file of await files(root)) {
  const source = await readFile(file, "utf8");
  const updated = await replaceImports(source, file);
  if (updated !== source) {
    await writeFile(file, updated);
  }
}

async function replaceImports(source: string, file: string): Promise<string> {
  const pattern = /(from\s*["']|import\(\s*["'])(\.[^"']+)(["'])/g;
  const matches = [...source.matchAll(pattern)];
  let updated = source;

  for (const match of matches.reverse()) {
    const specifier = match[2];
    if (specifier.endsWith(".js") || specifier.endsWith(".json")) {
      continue;
    }

    const sourcePath = resolve(dirname(file), specifier);
    const filePath = `${sourcePath}.js`;
    const indexPath = join(sourcePath, "index.js");
    let replacement = specifier;

    try {
      await readFile(filePath);
      replacement = `${specifier}.js`;
    } catch {
      try {
        await readFile(indexPath);
        replacement = `${specifier}/index.js`;
      } catch {
        continue;
      }
    }

    const start = match.index + match[1].length;
    updated = `${updated.slice(0, start)}${replacement}${updated.slice(start + specifier.length)}`;
  }

  return updated;
}
