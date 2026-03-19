import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function writeTextFile(filePath, contents) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, contents, "utf8");
}

export async function writeJsonFile(filePath, payload) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function countLines(text) {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}
