import { Hono } from "hono";
import type { Env } from "../index";

export const tasksRoute = new Hono<{ Bindings: Env }>();

/** claim TTL: 30分を超えたタスクはopenに戻す */
const CLAIM_TTL_MINUTES = 30;

// GET /tasks — 未着手タスク一覧（TTL切れのclaimedも含む）
tasksRoute.get("/", async (c) => {
  const tasks = await c.env.DB.prepare(
    `SELECT id, repo_url, issue_url, issue_number, issue_title, status, created_at
     FROM tasks
     WHERE status = 'open'
        OR (status = 'claimed' AND claimed_at < datetime('now', ?))
     ORDER BY created_at ASC`
  )
    .bind(`-${CLAIM_TTL_MINUTES} minutes`)
    .all();

  return c.json({ tasks: tasks.results });
});

// GET /tasks/:id — タスク詳細
tasksRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const task = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first();

  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});
