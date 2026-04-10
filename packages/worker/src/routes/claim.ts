import { Hono } from "hono";
import type { Env } from "../index";

export const claimRoute = new Hono<{ Bindings: Env }>();

const CLAIM_TTL_MINUTES = 30;

// POST /claim — タスクのロック取得（楽観ロック）
claimRoute.post("/", async (c) => {
  const { task_id, donor_handle } = await c.req.json<{
    task_id: string;
    donor_handle: string;
  }>();

  if (!task_id || !donor_handle) {
    return c.json({ error: "task_id and donor_handle are required" }, 400);
  }

  // openまたはTTL切れのclaimedタスクのみclaim可能
  const result = await c.env.DB.prepare(
    `UPDATE tasks
     SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now')
     WHERE id = ?
       AND (status = 'open'
            OR (status = 'claimed' AND claimed_at < datetime('now', ?)))`
  )
    .bind(donor_handle, task_id, `-${CLAIM_TTL_MINUTES} minutes`)
    .run();

  if (result.meta.changes === 0) {
    const task = await c.env.DB.prepare(
      "SELECT status FROM tasks WHERE id = ?"
    )
      .bind(task_id)
      .first();

    if (!task) return c.json({ error: "Task not found" }, 404);
    return c.json({ error: "Task already claimed", status: task.status }, 409);
  }

  return c.json({ ok: true, task_id, claimed_by: donor_handle });
});
