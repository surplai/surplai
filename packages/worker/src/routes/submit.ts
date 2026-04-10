import { Hono } from "hono";
import type { Env } from "../index";
import { createPullRequest } from "../github";

export const submitRoute = new Hono<{ Bindings: Env }>();

// POST /submit — patch送信 → PR作成
submitRoute.post("/", async (c) => {
  const { task_id, donor_handle, patch, model_used } = await c.req.json<{
    task_id: string;
    donor_handle: string;
    patch: string;
    model_used: string;
  }>();

  if (!task_id || !donor_handle || !patch) {
    return c.json(
      { error: "task_id, donor_handle, and patch are required" },
      400
    );
  }

  // patchサイズ制限 (1MB)
  if (patch.length > 1_000_000) {
    return c.json({ error: "Patch too large (max 1MB)" }, 413);
  }

  // タスクがこのドナーにclaimされているか確認
  const task = await c.env.DB.prepare(
    "SELECT * FROM tasks WHERE id = ? AND status = 'claimed' AND claimed_by = ?"
  )
    .bind(task_id, donor_handle)
    .first<{
      id: string;
      repo_url: string;
      issue_url: string;
      issue_number: number;
      issue_title: string;
    }>();

  if (!task) {
    return c.json(
      { error: "Task not found or not claimed by this donor" },
      404
    );
  }

  // repo_urlからowner/repo抽出
  const match = task.repo_url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return c.json({ error: "Invalid repo_url" }, 400);
  }
  const [, owner, repo] = match;

  // PR作成
  let prUrl: string;
  try {
    prUrl = await createPullRequest({
      appId: c.env.GITHUB_APP_ID,
      privateKey: c.env.GITHUB_PRIVATE_KEY,
      owner,
      repo,
      issueNumber: task.issue_number,
      issueTitle: task.issue_title ?? `issue #${task.issue_number}`,
      patch,
      donorHandle: donor_handle,
      modelUsed: model_used ?? "unknown",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: `Failed to create PR: ${message}` }, 502);
  }

  // submission記録 + タスクステータス更新
  const submissionId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO submissions (id, task_id, donor_handle, patch, pr_url, model_used)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(submissionId, task_id, donor_handle, patch, prUrl, model_used),
    c.env.DB.prepare(
      "UPDATE tasks SET status = 'submitted' WHERE id = ?"
    ).bind(task_id),
  ]);

  return c.json({ ok: true, pr_url: prUrl, submission_id: submissionId });
});
