# surplai — MVP Specification v2

> 作成日: 2026-04-10
> 改訂日: 2026-04-10 (リサーチ結果を反映)

## ゴール

**自分のリポのissueを、自分のLLMで解いて、Bot名義でPRを出す。E2Eフローを1本通す。**

---

## 設計判断 (リサーチに基づく)

### 1. バックエンド: 2種類、共通インターフェース

| バックエンド | 対象ドナー | 仕組み |
|-------------|-----------|--------|
| Claude Code headless | Max/API契約者 | `claude -p` でフルエージェント実行。ファイル探索・編集・テスト実行すべて組み込み |
| mini-swe-agent | 無料枠ドナー | `mini <issue_url>` でbashベースのエージェント実行。LiteLLM経由で全プロバイダー対応 |

**共通インターフェース:**
```
Input:  { repo_url, issue_url, issue_body }
Output: { patch: string (unified diff), model_used: string, success: boolean }
```

**MVPではClaude Code headlessから。** 手元で動くものが先。mini-swe-agentは2番目に追加。
インターフェースは最初から抽象化しておく。

**根拠:**
- Claude Code: フルツールアクセス（ファイル読み書き、bash、grep）、CLAUDE.md対応
- mini-swe-agent: Docker不要、100行コア、74% SWE-bench Verified、Gemini/Groq/ローカル対応
- 両者とも「clone → 探索 → 修正 → テスト → diff」のフローを自前で持つ

### 2. CLI体験: ポーリングループ (BOINC/Buildkiteパターン)

```
surplai start
  → サーバーにポーリング (long-poll ではなく単純なinterval poll)
  → タスク取得 → claim → 実行 → submit → 次のタスクへ
  → タスクがなければ待機 (30秒間隔)
  → Ctrl+C で停止
```

BOINC/Folding@home/Buildkiteすべてがこのパターン。

**手動モードも用意:**
```
surplai run <task_id>   # 特定タスクを1つだけ実行
```

デーモンモードは Phase 2。MVPではフォアグラウンドループ。

### 3. タスク投入: GitHub App webhook (label イベント)

MVP段階から**GitHub Appのwebhookで自動投入**する。理由:

- 手動D1投入ではE2Eの意味がない（メンテナ体験が検証できない）
- GitHub Appは anyway PR作成に必要 → webhook受信は追加コスト小
- メンテナがissueに `surplai:welcome` ラベルを付ける → webhook発火 → D1にタスク挿入

```
メンテナがラベル付与 → GitHub webhook → Worker → D1にtask挿入
ドナーがCLI起動 → GET /tasks → claim → 実行 → submit → Worker → PR作成
```

### 4. patch形式: unified diff テキスト

```
POST /submit
Content-Type: application/json

{
  "task_id": "...",
  "donor_handle": "...",
  "patch": "diff --git a/src/foo.ts b/src/foo.ts\n...",
  "model_used": "claude-opus-4-6"
}
```

- git diff の出力をそのまま送る
- Worker側でブランチ作成 → patchをcommit → PR作成
- サイズ上限: 1MB (Workers のリクエストボディ制限内)

### 5. claim TTL: 30分

BOINC (7-14日) は長すぎ、Buildkite (6時間) も長い。
LLMのタスク実行は通常2-10分。余裕を見て**30分**。

- `claimed_at` をD1に保存
- GET /tasks 時にサーバー側で `claimed_at + 30min < now()` のタスクを自動リリース
- 別途Cronは不要（リクエスト駆動で十分）

```sql
-- GET /tasks で返すクエリ
SELECT * FROM tasks
WHERE status = 'open'
   OR (status = 'claimed' AND claimed_at < datetime('now', '-30 minutes'))
ORDER BY created_at ASC
```

### 6. CLI設定

```
~/.surplai/config.json
{
  "server": "https://api.surplai.dev",
  "handle": "daisuke",
  "backend": "claude-code"  // or "mini-swe-agent"
}
```

**APIキーは各バックエンドの標準的な方法で管理:**
- Claude Code: `ANTHROPIC_API_KEY` 環境変数 (またはMax Planのログイン)
- mini-swe-agent: `GEMINI_API_KEY` / `OPENAI_API_KEY` 等の環境変数

surplai自体はAPIキーを保存しない。バックエンドに委ねる。

### 7. テストリポ

`surplai/test-repo` — TypeScriptプロジェクト

```
test-repo/
├── src/
│   ├── calc.ts        # 簡単な計算ライブラリ
│   └── parser.ts      # 文字列パーサー
├── tests/
│   ├── calc.test.ts
│   └── parser.test.ts
├── surplai.yaml       # opt-in設定
├── package.json
└── tsconfig.json
```

テスト用issueの例:
- [easy] `calc.ts` の `divide(a, b)` がゼロ除算でクラッシュする
- [medium] `parser.ts` の `parseDate()` がISO 8601形式を処理できない

---

## アーキテクチャ

```
                    ┌─────────── GitHub ───────────┐
                    │                              │
                    │  issue label event           │  PR作成
                    │  (surplai:welcome)           │  (surplai[bot])
                    ▼                              ▲
┌─────────────────────────────────────────────────────────┐
│  Worker (Cloudflare)                                     │
│                                                         │
│  POST /webhook    GitHub App webhook受信 → タスク登録    │
│  GET  /tasks      未着手タスク一覧 (TTL切れ含む)         │
│  POST /claim      ロック取得 (楽観ロック)                │
│  POST /submit     patch受信 → PR作成                    │
│                                                         │
│  Bindings: D1, GitHub App credentials (secrets)         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
                   D1 (SQLite)
                   - tasks
                   - submissions

────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  CLI (ドナーのマシン)                                    │
│                                                         │
│  surplai init     → config保存                          │
│  surplai start    → ポーリングループ                      │
│  surplai run <id> → 単発実行                            │
│                                                         │
│  Backend (抽象化):                                       │
│    ┌─────────────────┐  ┌──────────────────┐           │
│    │ Claude Code      │  │ mini-swe-agent   │           │
│    │ claude -p ...    │  │ mini <issue_url> │           │
│    │ → git diff       │  │ → .traj + patch  │           │
│    └─────────────────┘  └──────────────────┘           │
│                                                         │
│  APIキーはバックエンドが管理 (surplaiは保存しない)        │
└─────────────────────────────────────────────────────────┘
```

## D1 スキーマ

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  issue_url TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_title TEXT,
  issue_body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  donor_handle TEXT NOT NULL,
  patch TEXT NOT NULL,
  pr_url TEXT,
  pr_status TEXT NOT NULL DEFAULT 'pending',
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

## GitHub App

名前: `surplai`
権限:
- Issues: Read (issueの本文取得)
- Pull Requests: Write (PR作成)
- Contents: Write (ブランチ作成・push)
- Webhooks: issues (label イベント)

Webhook受信フロー:
```
GitHub → POST /webhook → action: "labeled"
  → label.name === "surplai:welcome" ?
  → はい → issue情報取得 → D1にtask挿入
  → いいえ → 無視
```

## CLI コマンド

### surplai init
```
$ npx surplai init

? Backend:
  ❯ Claude Code (claude -p)
    mini-swe-agent (Gemini/Groq/ローカル)

? Donor handle (for leaderboard): daisuke
? Server URL [https://api.surplai.dev]:

✅ Config saved to ~/.surplai/config.json
⚠️  Ensure your LLM API key is set:
   Claude Code: ANTHROPIC_API_KEY or Max Plan login
   mini-swe-agent: GEMINI_API_KEY, OPENAI_API_KEY, etc.
```

### surplai start
```
$ npx surplai start

🔄 Polling for tasks...

📋 Found task: Fix divide-by-zero in calc.ts (surplai/test-repo#1)
🔒 Claimed
📦 Cloning surplai/test-repo...
🤖 Running Claude Code...
   [claude -p output streamed here]
✅ Patch generated (12 lines changed)
📤 Submitting...
🎉 PR created: https://github.com/surplai/test-repo/pull/1

🔄 Polling for tasks... (30s interval)
   No tasks available. Waiting...
^C
👋 Stopped.
```

### surplai run <task_id>
```
$ npx surplai run task_abc123

📋 Task: Fix divide-by-zero in calc.ts (surplai/test-repo#1)
🔒 Claimed
📦 Cloning surplai/test-repo...
🤖 Running Claude Code...
✅ Patch generated (12 lines changed)
📤 Submitting...
🎉 PR created: https://github.com/surplai/test-repo/pull/1
```

## バックエンド実行の詳細

### Claude Code headless
```bash
# CLI内部での実行イメージ
cd /tmp/surplai-work/<task_id>
git clone <repo_url> repo && cd repo
git checkout -b surplai/fix-<issue_number>

claude -p "$(cat <<EOF
Fix GitHub issue #${issue_number}: ${issue_title}

${issue_body}

Instructions:
- Explore the codebase to understand the problem
- Implement the fix
- Run tests to verify (look for test scripts in package.json)
- Do not modify unrelated files
EOF
)" --dangerously-skip-permissions --max-turns 15 --output-format stream-json

# Claude Codeがファイルを直接編集してテストも実行する
git diff  # → これがpatch
```

### mini-swe-agent (Phase 2)
```bash
# CLI内部での実行イメージ
export GEMINI_API_KEY=...
mini -y -m gemini/gemini-2.5-flash <issue_url>
# → ~/.mini-swe-agent/last_mini_run.traj.json にトラジェクトリ
# → ローカルにpatchが適用される (--actions.apply_patch_locally)
git diff  # → これがpatch
```

## ファイル構成

```
surplai/
├── docs/
│   ├── tos-analysis.md
│   ├── technical-feasibility.md
│   └── mvp-spec.md
├── packages/
│   ├── worker/
│   │   ├── src/
│   │   │   ├── index.ts           # Honoルーター
│   │   │   ├── routes/
│   │   │   │   ├── tasks.ts       # GET /tasks
│   │   │   │   ├── claim.ts       # POST /claim
│   │   │   │   ├── submit.ts      # POST /submit
│   │   │   │   └── webhook.ts     # POST /webhook (GitHub)
│   │   │   └── github.ts          # GitHub App token + PR作成
│   │   ├── migrations/
│   │   │   └── 0001_init.sql
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── cli/
│       ├── src/
│       │   ├── index.ts            # エントリポイント (commander)
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── start.ts        # ポーリングループ
│       │   │   └── run.ts          # 単発実行
│       │   ├── backends/
│       │   │   ├── types.ts        # Backend interface
│       │   │   └── claude-code.ts  # claude -p ラッパー
│       │   ├── api.ts              # Worker APIクライアント
│       │   └── config.ts           # ~/.surplai/config.json 管理
│       └── package.json
├── package.json
└── pnpm-workspace.yaml
```

## 実装順序

1. **monorepo セットアップ** — pnpm workspace + TypeScript
2. **GitHub App 作成** — github.com/settings/apps で登録、キー取得
3. **Worker: webhook + tasks + claim** — タスク投入〜取得まで
4. **Worker: submit + PR作成** — patch受信 → GitHub PR
5. **CLI: init + config** — 設定保存
6. **CLI: backends/types.ts** — Backend interface定義
7. **CLI: backends/claude-code.ts** — claude -p ラッパー
8. **CLI: commands/run.ts** — 単発実行（デバッグしやすい）
9. **CLI: commands/start.ts** — ポーリングループ
10. **テストリポ作成 + E2E** — 全フロー動作確認
