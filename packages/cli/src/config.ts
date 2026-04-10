import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".surplai");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Config = {
  server: string;
  handle: string;
  backend: "claude-code" | "mini-swe-agent";
};

const DEFAULT_CONFIG: Config = {
  server: "https://api.surplai.dev",
  handle: "",
  backend: "claude-code",
};

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export { CONFIG_FILE };
