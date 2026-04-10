# surplai — LLM Provider Terms of Service Analysis

> 調査日: 2026-04-10
> ユースケース: ドナーが自分のマシン・自分のAPIキー/サブスクで、OSSのissueを解くコードを生成し、diffだけ中央サーバーに送る

## Summary

| Provider | Verdict | Risk Level | Notes |
|----------|---------|------------|-------|
| Google Gemini (AI Studio) | ✅ OK | Low | 無料枠も問題なし。Agentic利用を明示的に想定 |
| OpenAI | ✅ OK | Low | APIキーが自分のマシンに留まる限り問題なし |
| Mistral | ⚠️ OK (注意) | Low-Med | 無料枠は「探索用」との記載。大量自動利用はグレー |
| Groq | ✅ OK | Low | エージェント利用を想定した記述あり |
| Cerebras | ✅ OK | Low | API経由の自動化は明示的に許可。モデルライセンス別途確認要 |
| OpenRouter | ⚠️ OK (注意) | Medium | ログ有効時にデータ利用権あり。無料枠50 req/日 |
| Anthropic API | ✅ OK | Low | APIキー経由なら問題なし |
| Anthropic Max Plan | ⚠️ グレー | Medium | Pull型設計なら「自主的利用」に近いが、規約の文言上リスクあり |

## Detail

### Google Gemini (AI Studio) — ✅ OK

- APIのプログラマティック利用は明示的に許可
- 「Agentic Services」セクションがあり、エージェント利用を想定
- 出力の所有権はユーザーに帰属、利用制限なし
- 無料枠に「探索用のみ」等の制限記載なし
- レート制限はRPM/TPM/RPD（ダッシュボードで確認）

> "Google won't claim ownership over that content."

**結論:** 最優先対応で問題なし。

---

### OpenAI — ✅ OK

- APIは元々プログラマティック利用のためのもの
- キー転売禁止条項: "buy, sell, or transfer API keys from, to, or with a third party" → キーがドナーのマシンに留まる限り該当しない
- 出力の所有権はユーザーに帰属: "OpenAI hereby assigns to you all its right, title, and interest in and to Output."
- 「競合製品」条項はAI/LLMサービス自体の競合を指し、下流アプリには適用されない
- コード生成→OSS PR提出は許可された利用パターン

**結論:** 問題なし。

---

### Mistral — ⚠️ OK (注意あり)

- APIのプログラマティック利用に禁止条項なし
- 出力の所有権はユーザーに帰属: "Customer...owns all Output. Mistral AI hereby assigns to Customer all right, title, and interest..."
- Le Chat / Mistral Code は第三者統合に制限あり → **APIには適用されない**
- **無料枠 (Experiment plan) は "designed to allow you to try and explore our API" と記載** — 大量自動利用がこの趣旨に合わないと解釈される可能性あり
- 無料枠のデータはモデル訓練に使用される可能性あり（opt-out可）

**結論:** 有料プランなら完全にOK。無料枠での大量利用はグレーだが、レート制限内なら実質問題ない。

---

### Groq — ✅ OK

- "agentic AI Model Service" に言及しており、エージェント利用を想定
- APIスクレーピング禁止条項はあるが、正規API利用は明示的に除外
- 出力利用に関する制限なし
- レート制限の迂回（複数アカウント等）は禁止
- 競合サービス構築は禁止 → surplaiは推論サービスではないので該当しない

> "Use any robot, spider, scraper...except for use of the APIs in accordance with the documentation therefor"

**結論:** 問題なし。

---

### Cerebras — ✅ OK

- ロボット/スクレーパー制限にAPI利用の除外が明記: "except for use of the APIs in accordance with the documentation therefor"
- APIライセンスはアプリケーション開発・エンドユーザー配布を許可
- 出力の所有権を主張しない: "Cerebras claims no ownership rights over the Outputs"
- 競合サービス構築は禁止 → surplaiは推論サービスではないので該当しない
- **Third-Party Model Terms（Llama等）への準拠が別途必要**

**結論:** 問題なし。ただしLlamaのライセンス（Meta Community License）を別途確認のこと。

---

### OpenRouter — ⚠️ OK (注意あり)

- APIのプログラマティック利用に禁止条項なし
- API再販・競合サービス構築は禁止 → surplaiは該当しない
- 出力の所有権は各モデルプロバイダーの規約に従う
- **⚠️ ログ有効（デフォルト）時、OpenRouterが入出力の商用利用権を取得する（irrevocable）**
  - → ドナーにはログ無効化を推奨すべき
- 無料枠は50 req/日（以前は200だったが2025年4月に削減）
- 有料残高$10+で1,000 req/日に拡大

**結論:** 利用可能だが、ログ無効化をCLIのセットアップ時に案内すべき。無料枠の少なさ(50 req/日)は補助的利用にとどまる。

---

### Anthropic — ⚠️ 要注意（APIとMax Planで判断が分かれる）

#### API Key 経由 — ✅ OK

- Consumer Termsのbot/script禁止条項はAPIキー利用を明示的に除外
- 出力のOSS貢献・第三者利用に制限なし
- エージェント利用はUsage Policy準拠で許可

#### Max Plan ($200/月) — ⚠️ グレー（Pull型設計で緩和）

規約上の懸念条項:

1. **自動化禁止** (Consumer Terms Section 3(7)):
   > "Except when you are accessing our Services via an Anthropic API Key...to access the Services through automated or non-human means, whether through a bot, script, or otherwise."
   → ただしClaude Code自体がヘッドレスモード (`claude -p`) やAgent SDKを公式提供しており、自動化を想定した設計になっている

2. **通常個人利用の前提**:
   > "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."
   → 「ordinary」の解釈次第。cronでの自動化は広く行われている

3. **第三者ルーティング禁止**:
   > "Anthropic does not permit third-party developers to offer Claude.ai login or to route requests through Free, Pro, or Max plan credentials on behalf of their users."
   → **Push型**（サーバーがタスクを配信して実行させる）なら抵触する可能性あり
   → **Pull型**（ドナーが自分でタスクを取りに行って実行する）ならこれは「自主的な利用」であり、GitHub Issuesを見てPRを出すのと構造的に同じ

**surplaiのPull型設計における判断:**
- サーバーはタスク一覧を公開するだけ（REST API）
- ドナーが自発的にCLIを起動し、タスクを選択し、自分のマシンで実行
- サーバーはClaude Codeへのリクエスト送信に一切関与しない
- クレデンシャルはドナーのマシンにのみ存在

これは「第三者がルーティングしている」というよりは「ドナーがタスクボードを見て自主的に作業している」に近い。ただし規約の文言上は解釈の余地があるため、完全にリスクフリーとは言えない。

**結論:** Pull型設計ならリスクは低いが、規約の文言上グレー。ドナーに対してリスクの存在を開示した上で、自己責任での利用とすべき。APIキー経由のほうが確実に安全。

---

## surplaiへの提言

### 1. Max Plan はリスク開示の上でサポートする
Pull型設計（ドナーが自発的にタスクを取りに行く）ならリスクは低いが、規約の文言上グレーゾーン。CLIのセットアップ時に「Anthropic Max Planの規約上、自動化利用に解釈の余地があります」と開示し、ドナーの判断に委ねる。APIキー経由を推奨する旨も併記する。

### 2. OpenRouter利用時のログ無効化を案内する
`surplai init` でOpenRouterを選択した場合、「ログを無効にしてください」と案内する。

### 3. Mistral無料枠の位置づけを明確にする
「探索用」の記載があるため、Tier Sではなく Tier A に格下げするか、注記を追加する。

### 4. モデルライセンスの確認レイヤーを追加する
Cerebras/Groq/OpenRouter経由のオープンソースモデル（Llama, Qwen等）は、モデル自体のライセンスにも準拠する必要がある。Meta Community License等の確認が別途必要。

### 5. 全プロバイダー共通の安全設計
- APIキーはドナーのマシンにのみ保存 ✅（既に設計済み）
- サーバーにはdiffのみ送信 ✅（既に設計済み）
- レート制限はCLI側で遵守 ✅（実装時に各プロバイダーのlimit確認）
