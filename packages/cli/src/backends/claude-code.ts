import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Backend, ChangedFile, TaskInput, TaskResult } from "./types.js";

const execFile = promisify(execFileCb);

/**
 * Claude Code headless バックエンド
 *
 * claude -p でフルエージェント実行 → git diff でpatch取得
 */
export class ClaudeCodeBackend implements Backend {
  readonly name = "claude-code";

  async run(input: TaskInput): Promise<TaskResult> {
    const workDir = join(tmpdir(), "surplai", `task-${input.issueNumber}`);

    try {
      // 作業ディレクトリ準備
      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });

      // git clone
      console.log(`  Cloning ${input.repoUrl}...`);
      await execFile("git", ["clone", "--depth=1", input.repoUrl, "repo"], {
        cwd: workDir,
      });

      const repoDir = join(workDir, "repo");

      // ブランチ作成
      await execFile(
        "git",
        ["checkout", "-b", `surplai/fix-${input.issueNumber}`],
        { cwd: repoDir }
      );

      // Claude Code headless実行
      console.log("  Running Claude Code...");
      const prompt = buildPrompt(input);
      const { stdout } = await execFile(
        "claude",
        [
          "-p",
          prompt,
          "--dangerously-skip-permissions",
          "--max-turns",
          "15",
          "--output-format",
          "json",
        ],
        { cwd: repoDir, timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }
      );

      // Claude Codeの出力をパース
      let claudeOutput: { result?: string; is_error?: boolean };
      try {
        claudeOutput = JSON.parse(stdout);
      } catch {
        claudeOutput = { result: stdout };
      }

      if (claudeOutput.is_error) {
        return {
          success: false,
          patch: "",
          files: [],
          modelUsed: "claude-code",
          error: claudeOutput.result ?? "Claude Code returned an error",
        };
      }

      // git diff取得 (unstaged + staged)
      const { stdout: unstaged } = await execFile("git", ["diff"], {
        cwd: repoDir,
      });
      const { stdout: staged } = await execFile("git", ["diff", "--staged"], {
        cwd: repoDir,
      });

      const patch = (unstaged + staged).trim();

      if (!patch) {
        return {
          success: false,
          patch: "",
          files: [],
          modelUsed: "claude-code",
          error: "No changes were made",
        };
      }

      // 変更ファイルの一覧と内容を取得
      const { stdout: filesRaw } = await execFile(
        "git",
        ["diff", "--name-only", "HEAD"],
        { cwd: repoDir }
      );
      const filePaths = filesRaw.trim().split("\n").filter(Boolean);
      const files: ChangedFile[] = [];
      for (const fp of filePaths) {
        const content = await readFile(join(repoDir, fp), "utf-8");
        files.push({ path: fp, content });
      }

      return { success: true, patch, files, modelUsed: "claude-code" };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function buildPrompt(input: TaskInput): string {
  return `Fix GitHub issue #${input.issueNumber}: ${input.issueTitle}

${input.issueBody}

Instructions:
- Explore the codebase to understand the problem
- Implement the fix
- Run tests to verify your fix works (look for test scripts in package.json or similar)
- Do not modify unrelated files
- Keep changes minimal and focused`;
}
