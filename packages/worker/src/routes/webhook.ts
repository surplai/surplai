import { Hono } from "hono";
import type { Env } from "../index";

export const webhookRoute = new Hono<{ Bindings: Env }>();

// POST /webhook — GitHub App webhook受信
webhookRoute.post("/", async (c) => {
  const event = c.req.header("x-github-event");
  if (event !== "issues") {
    return c.json({ ignored: true, reason: `event: ${event}` });
  }

  // TODO: webhook signature検証 (GITHUB_WEBHOOK_SECRET)

  const payload = await c.req.json<{
    action: string;
    issue: {
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      labels: Array<{ name: string }>;
    };
    repository: {
      full_name: string;
      html_url: string;
    };
  }>();

  // labeledイベントかつsurplai:welcomeラベルの場合のみ処理
  if (payload.action !== "labeled") {
    return c.json({ ignored: true, reason: `action: ${payload.action}` });
  }

  const hasSurplaiLabel = payload.issue.labels.some(
    (l) => l.name === "surplai:welcome"
  );
  if (!hasSurplaiLabel) {
    return c.json({ ignored: true, reason: "no surplai:welcome label" });
  }

  // 既に同じissueのタスクがあるか確認
  const existing = await c.env.DB.prepare(
    "SELECT id FROM tasks WHERE issue_url = ?"
  )
    .bind(payload.issue.html_url)
    .first();

  if (existing) {
    return c.json({ ignored: true, reason: "task already exists" });
  }

  // タスク登録
  const taskId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, repo_url, issue_url, issue_number, issue_title, issue_body)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      taskId,
      payload.repository.html_url,
      payload.issue.html_url,
      payload.issue.number,
      payload.issue.title,
      payload.issue.body ?? ""
    )
    .run();

  return c.json({ ok: true, task_id: taskId });
});
