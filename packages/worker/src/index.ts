import { Hono } from "hono";
import { cors } from "hono/cors";
import { tasksRoute } from "./routes/tasks";
import { claimRoute } from "./routes/claim";
import { submitRoute } from "./routes/submit";
import { webhookRoute } from "./routes/webhook";

export type Env = {
  DB: D1Database;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.get("/", (c) =>
  c.json({
    name: "surplai",
    version: "0.0.1",
    description: "Route unused AI resources to where they're needed most",
  })
);

app.route("/tasks", tasksRoute);
app.route("/claim", claimRoute);
app.route("/submit", submitRoute);
app.route("/webhook", webhookRoute);

export default app;
