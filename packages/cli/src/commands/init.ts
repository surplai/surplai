import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveConfig, CONFIG_FILE, type Config } from "../config.js";

export async function initCommand(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("\n  Welcome to surplai!");
    console.log(
      "  Route unused AI resources to where they're needed most.\n"
    );

    // バックエンド選択
    console.log("  Backends:");
    console.log("    1. Claude Code (claude -p)");
    console.log("    2. mini-swe-agent (Gemini/Groq/local)");
    const backendChoice = await rl.question("\n? Backend [1]: ");
    const backend: Config["backend"] =
      backendChoice === "2" ? "mini-swe-agent" : "claude-code";

    // ドナーハンドル
    const handle = await rl.question("? Donor handle: ");
    if (!handle.trim()) {
      console.error("Error: handle is required");
      process.exit(1);
    }

    // サーバーURL
    const serverInput = await rl.question(
      "? Server URL [https://api.surplai.dev]: "
    );
    const server = serverInput.trim() || "https://api.surplai.dev";

    const config: Config = { server, handle: handle.trim(), backend };
    await saveConfig(config);

    console.log(`\n  Config saved to ${CONFIG_FILE}`);
    console.log(`  Backend: ${backend}`);
    console.log(`  Handle: ${config.handle}`);

    // APIキーのヒント
    if (backend === "claude-code") {
      console.log(
        "\n  Ensure ANTHROPIC_API_KEY is set, or use Max Plan login."
      );
    } else {
      console.log(
        "\n  Ensure your LLM API key is set (GEMINI_API_KEY, OPENAI_API_KEY, etc.)"
      );
    }

    console.log("\n  Run `surplai start` to begin contributing!\n");
  } finally {
    rl.close();
  }
}
