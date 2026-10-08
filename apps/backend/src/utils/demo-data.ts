import { access } from "node:fs/promises";
import { join } from "node:path";

const candidates = [
  join(process.cwd(), "data", "demo"),
  join(process.cwd(), "..", "..", "data", "demo"),
];

export async function demoPath(file: string): Promise<string> {
  for (const directory of candidates) {
    try {
      const path = join(directory, file);
      await access(path);
      return path;
    } catch {
      // Try the next workspace layout.
    }
  }
  throw new Error(`Demo data file not found: ${file}`);
}
