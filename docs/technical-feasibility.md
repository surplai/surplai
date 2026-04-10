# surplai — Technical Feasibility Report

> 調査日: 2026-04-10

## 実行エンジン: 自前で作らない

### SWE-agent / mini-swe-agent

「issue URL → patch」がコア機能のOSSエージェント。surplaiが必要とする機能がそのまま揃っている。

| | SWE-agent | mini-swe-agent |
|--|-----------|----------------|
| コア機能 | issue URL → patch | 同左 |
| ツール | find_file, search_dir, search_file, open, edit | bash (find, grep, cat, sed等をLLMが自由に実行) |
| LLM対応 | LiteLLM経由で全プロバイダー | 同左 |
| Docker | 組み込み | 組み込み |
| ライセンス | MIT | MIT |
| SWE-bench | リーダーボード本家 | 100行で74% Verified |
| PyPI | `pip install sweagent` | `pip install mini-swe-agent` |
| 現状 | 安定版 | **開発の主力が移行中** |

### Claude Code headless

```bash
claude -p "Fix this issue: <issue_body>" --output-format json
```

- ツールが最も強力（ファイル探索、Web検索、ドキュメント参照）
- Anthropic APIまたはMax Planのみ
- Docker sandboxなし（ホスト環境で実行）
- issue取得・diff抽出パイプラインは自前で構築

### 選定方針

```
バックエンドを抽象化し、両方サポートする:
  interface: issue_url in → patch out

  A. mini-swe-agent + Gemini/Groq/ローカル → 無料枠ドナー向け
  B. Claude Code headless → Max/API契約ドナー向け（品質重視）
```

MVPはBから動かし、Aを後から追加。

## GitHub連携: GitHub App

| 比較 | GitHub App | PAT (bot account) | Actions Token |
|------|-----------|-------------------|---------------|
| 他人のリポ | ✅ インストール可 | ❌ 招待が必要 | ❌ 同リポのみ |
| [bot]バッジ | ✅ surplai[bot] | ❌ 通常ユーザー表示 | ✅ github-actions[bot] |
| 権限スコープ | ✅ リポ単位で細かく | ⚠️ 粗い | ✅ 細かい |
| レート制限 | 5,000 req/h per install | 5,000 req/h 共有 | 1,000 req/h |
| セットアップ | 中（JWT認証フロー） | 低 | ゼロ |
| コスト | 無料 | 無料 | 無料 |

**GitHub App一択。** メンテナがリポにインストールしてopt-inする設計と完全に合致。

## Cloudflare Workers

| 項目 | 無料枠 | 有料 ($5/月) |
|------|--------|-------------|
| リクエスト | 100K/日 | 1000万/月 |
| CPU時間 | 10ms | 30秒 |
| D1 | 5GB | 5GB |

CPU 10msでGitHub API呼び出しが足りない場合は $5/月 の有料プラン。
代替: Hono + Fly.io / Deno Deploy（いずれも無料枠あり）。

## リソース要件

SWE-agent推奨: 8CPU, 16GB RAM, 120GB disk
→ ドナーのマシンスペックに依存。最低要件をドキュメント化する必要あり。

mini-swe-agentはより軽量（Docker + LLM APIコールのみ）。
