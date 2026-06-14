// Loads configuration from config.json in the project root.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/config.js -> project root is one level up from dist/
const CONFIG_PATH = resolve(__dirname, "..", "config.json");

export interface Config {
  discordToken: string;
  grokSso: string;
  grokSsoRw?: string;
  grokUserAgent?: string;
  commandPrefix: string;
  contextMessageCount: number;
}

const DEFAULTS = {
  commandPrefix: "!grok",
  contextMessageCount: 50,
};

export function loadConfig(): Config {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch {
    throw new Error(
      `Could not read config.json at ${CONFIG_PATH}. Copy config.example.json to config.json and fill it in.`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const discordToken = parsed.discordToken;
  const grokSso = parsed.grokSso;

  if (typeof discordToken !== "string" || !discordToken.trim()) {
    throw new Error('config.json: "discordToken" is required and must be a non-empty string.');
  }
  if (typeof grokSso !== "string" || !grokSso.trim()) {
    throw new Error('config.json: "grokSso" is required and must be a non-empty string.');
  }

  return {
    discordToken: discordToken.trim(),
    grokSso: grokSso.trim(),
    grokSsoRw: typeof parsed.grokSsoRw === "string" && parsed.grokSsoRw.trim() ? parsed.grokSsoRw.trim() : undefined,
    grokUserAgent:
      typeof parsed.grokUserAgent === "string" && parsed.grokUserAgent.trim() ? parsed.grokUserAgent.trim() : undefined,
    commandPrefix:
      typeof parsed.commandPrefix === "string" && parsed.commandPrefix.trim()
        ? parsed.commandPrefix.trim()
        : DEFAULTS.commandPrefix,
    contextMessageCount:
      typeof parsed.contextMessageCount === "number" && parsed.contextMessageCount > 0
        ? Math.floor(parsed.contextMessageCount)
        : DEFAULTS.contextMessageCount,
  };
}
