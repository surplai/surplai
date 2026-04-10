import { loadConfig } from "../config.js";
import { SurplaiAPI } from "../api.js";
import { ClaudeCodeBackend } from "../backends/claude-code.js";
import { executeTask } from "./run.js";
import type { Backend } from "../backends/types.js";

const POLL_INTERVAL_MS = 30_000; // 30秒

function createBackend(name: string): Backend {
  switch (name) {
    case "claude-code":
      return new ClaudeCodeBackend();
    default:
      throw new Error(`Unknown backend: ${name}`);
  }
}

/** surplai start — ポーリングループ */
export async function startCommand(): Promise<void> {
  const config = await loadConfig();
  if (!config.handle) {
    console.error("Error: run `surplai init` first");
    process.exit(1);
  }

  const api = new SurplaiAPI(config.server);
  const backend = createBackend(config.backend);

  console.log(`\nsurplai v0.0.1`);
  console.log(`  Backend: ${config.backend}`);
  console.log(`  Handle: ${config.handle}`);
  console.log(`  Server: ${config.server}`);
  console.log(`\nPolling for tasks... (Ctrl+C to stop)\n`);

  // Ctrl+Cで綺麗に止まるようにする
  let running = true;
  process.on("SIGINT", () => {
    console.log("\nStopping...");
    running = false;
  });

  while (running) {
    try {
      const tasks = await api.getTasks();

      if (tasks.length === 0) {
        process.stdout.write("  No tasks available. Waiting...\r");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 最も古いタスクを自動選択
      const task = tasks[0];
      console.log(
        `  Found: ${task.issue_title} (${task.issue_url})`
      );

      try {
        await executeTask(api, backend, task.id, config.handle);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  Error: ${msg}`);
      }

      // 少し待ってから次のタスクへ
      await sleep(3_000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Poll error: ${msg}`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log("Stopped.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
