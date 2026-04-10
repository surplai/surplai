import { loadConfig } from "../config.js";
import { SurplaiAPI } from "../api.js";
import { ClaudeCodeBackend } from "../backends/claude-code.js";
import type { Backend } from "../backends/types.js";

function createBackend(name: string): Backend {
  switch (name) {
    case "claude-code":
      return new ClaudeCodeBackend();
    // TODO: mini-swe-agent backend
    default:
      throw new Error(`Unknown backend: ${name}`);
  }
}

/** 単一タスクを実行する */
export async function executeTask(
  api: SurplaiAPI,
  backend: Backend,
  taskId: string,
  handle: string
): Promise<boolean> {
  // タスク詳細取得
  const task = await api.getTask(taskId);
  console.log(
    `\nTask: ${task.issue_title} (${task.issue_url})`
  );

  // claim
  console.log("  Claiming...");
  await api.claim(taskId, handle);
  console.log("  Claimed");

  // バックエンド実行
  console.log(`  Running ${backend.name}...`);
  const result = await backend.run({
    repoUrl: task.repo_url,
    issueUrl: task.issue_url,
    issueNumber: task.issue_number,
    issueTitle: task.issue_title ?? `issue #${task.issue_number}`,
    issueBody: task.issue_body ?? "",
  });

  if (!result.success) {
    console.log(`  Failed: ${result.error}`);
    return false;
  }

  console.log(
    `  Patch generated (${result.patch.split("\n").length} lines)`
  );

  // submit
  console.log("  Submitting...");
  const { prUrl } = await api.submit({
    taskId,
    donorHandle: handle,
    patch: result.patch,
    files: result.files,
    modelUsed: result.modelUsed,
  });

  console.log(`  PR created: ${prUrl}`);
  return true;
}

/** surplai run <task_id> */
export async function runCommand(taskId: string): Promise<void> {
  const config = await loadConfig();
  if (!config.handle) {
    console.error("Error: run `surplai init` first");
    process.exit(1);
  }

  const api = new SurplaiAPI(config.server);
  const backend = createBackend(config.backend);

  const success = await executeTask(api, backend, taskId, config.handle);
  process.exit(success ? 0 : 1);
}
