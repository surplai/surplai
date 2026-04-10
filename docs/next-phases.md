# surplai — Next Phases

> 作成日: 2026-04-10
> MVP完了後のロードマップ

## 現状 (MVP完了)

- Worker: Cloudflare Workers + D1 (surplai-api.d-s-sugar.workers.dev)
- CLI: init / start / run (Claude Code headlessバックエンド)
- GitHub App: surplai (ID: 3335089)
- PR作成: GitHub App → 元リポに直接push → PR (surplai[bot]名義)
- E2E動作確認済み: surplai/test-repo#1 → PR#8

## Phase 2: fork方式 + PR品質向上

### PR作成の3パス

CLIのインターフェースは共通 (POST /submit)。Workerの出口を3つ用意:

| パス | 仕組み | PR名義 | メンテナの手間 |
|------|--------|--------|---------------|
| A. surplai fork (デフォルト) | Worker がsurplai orgでfork → push → PR | `surplai` | なし |
| B. GitHub App (今のMVP) | App installation token で直接push | `surplai[bot]` | Appインストール |
| C. ドナー名義 (opt-in) | ドナーのGitHub tokenでfork → PR | ドナー個人 | なし |

**Aが本命。** App不要 + CI事前検証可能 + 匿名。

### fork方式の詳細フロー

```
CLI: clone → 修正 → テスト → POST /submit (diff + files)
Worker:
  1. surplai orgでfork作成 (POST /repos/{owner}/{repo}/forks)
  2. forkにブランチ作成 + commit (Git Data API)
  3. fork上でCI実行を待つ
  4. CI通過 → 元リポにcross-repo PR作成
  5. CI失敗 → PRは出さない
  6. PR merge/close後 → fork自動削除
```

### CI事前検証

fork方式の最大のメリット。PRを出す前にCIで検証できる。
メンテナに届くのは「CI通過済みのPRだけ」。

課題: CI結果の確認が非同期。
- 案1: Worker がGitHub Actions のcheck runs APIをポーリング
- 案2: GitHub webhookでcheck_suite completedを受信

### fork管理

- PR merge/close後にforkを自動削除
- GitHub API: `DELETE /repos/surplai/{repo}`
- Cron Workerで古いforkを定期掃除

## Phase 2: mini-swe-agent バックエンド

```
CLI backends:
  claude-code.ts  ← 今のMVP
  mini-swe-agent.ts  ← 追加

mini -y -m gemini/gemini-2.5-flash <issue_url>
```

- Docker不要、pip installだけ
- LiteLLM経由で全プロバイダー対応 (Gemini, Groq, Cerebras, ローカル)
- 無料枠ドナーの主力バックエンド
- 74% SWE-bench Verified (100行コア)

## Phase 2: タスク取り込みの拡充

### 現状
- GitHub App webhook (labelイベント) のみ

### 追加案
- **定期スキャン**: surplai.yaml があるリポのissueを定期的にチェック
- **手動登録API**: POST /tasks でCLI/ダッシュボードからタスク追加
- **App無しリポ**: GitHub API経由でラベル付きissueを検索
  - stars閾値 (例: 100+) で品質フィルタ
  - surplai.yaml の存在をopt-in証明として使用

## Phase 3: ダッシュボード + 学習データ

- Cloudflare Pages 静的サイト (surplai.dev)
- リーダーボード
- プロジェクト一覧
- タスク統計
- outcomes.jsonl エクスポート (D1 → git, Cron Worker)

## Phase 3: npm publish

- CLI を `npx surplai` で使えるように
- パッケージ名 `surplai` は確保済み

## Phase 3: ドナー体験の改善

- デーモンモード (バックグラウンド実行)
- ドナー設定: 難易度フィルタ、最大タスク数、アイドル時のみ実行
- 貢献統計の可視化

## 技術的TODO

- [ ] Worker: webhook signature検証 (GITHUB_WEBHOOK_SECRET)
- [ ] Worker: fork方式のPR作成パス (Phase 2本命)
- [ ] CLI: mini-swe-agent バックエンド
- [ ] CLI: startコマンドのテスト
- [ ] D1: migrations/0001_init.sql と実DBのスキーマ差分修正 (donor_handle列)
- [ ] Worker: カスタムドメイン (api.surplai.dev)
- [ ] surplai.dev のランディングページ

## 設計メモ

### サーバーは薄く、エッジにインテリジェンス
- Worker はタスクキュー + GitHub API プロキシ
- LLM実行・テスト・コード探索は全部CLI側
- fork方式でもWorkerが仲介（surplai orgのPATを安全に管理するため）

### 折衷案: issueコメント方式 (検討中)
App不要、fork不要の第3の方法:
1. good-first-issue + help-wanted のissueを探す
2. issueにコメント: "surplaiで取り組んでいいですか？"
3. メンテナがOKしたら実行
4. ドナーまたはsurplai名義でfork → PR

BOINC的な「気軽さ」に最も近い。ただしメンテナのopt-inが曖昧になるリスク。
