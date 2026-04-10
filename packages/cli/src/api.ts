/** surplai Worker APIクライアント */

export type Task = {
  id: string;
  repo_url: string;
  issue_url: string;
  issue_number: number;
  issue_title: string;
  issue_body?: string;
  status: string;
  created_at: string;
};

export class SurplaiAPI {
  constructor(private baseUrl: string) {}

  async getTasks(): Promise<Task[]> {
    const res = await fetch(`${this.baseUrl}/tasks`);
    if (!res.ok) throw new Error(`GET /tasks failed: ${res.status}`);
    const data = (await res.json()) as { tasks: Task[] };
    return data.tasks;
  }

  async getTask(id: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`);
    if (!res.ok) throw new Error(`GET /tasks/${id} failed: ${res.status}`);
    return (await res.json()) as Task;
  }

  async claim(taskId: string, donorHandle: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, donor_handle: donorHandle }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      throw new Error(body.error ?? `POST /claim failed: ${res.status}`);
    }
  }

  async submit(params: {
    taskId: string;
    donorHandle: string;
    patch: string;
    files: Array<{ path: string; content: string }>;
    modelUsed: string;
  }): Promise<{ prUrl: string }> {
    const res = await fetch(`${this.baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: params.taskId,
        donor_handle: params.donorHandle,
        patch: params.patch,
        files: params.files,
        model_used: params.modelUsed,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = `POST /submit failed: ${res.status}`;
      try {
        const body = JSON.parse(text) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        message = `${message} — ${text}`;
      }
      throw new Error(message);
    }
    const data = (await res.json()) as { pr_url: string };
    return { prUrl: data.pr_url };
  }
}
