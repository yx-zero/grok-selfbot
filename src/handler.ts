// Handles incoming messages: detects the !grok command on our own messages,
// gathers context, asks Grok, and posts the reply.
import type { Client, Message } from "discord.js-selfbot-v13";
import type { Config } from "./config.js";
import { fetchContext } from "./context.js";
import { buildPrompt } from "./prompt.js";
import { askGrok, GrokError } from "./grok/client.js";
import { stripCitations, chunkMessage } from "./format.js";

export function registerHandler(client: Client, config: Config): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      await handleMessage(client, config, message);
    } catch (err) {
      console.error("Unhandled error in message handler:", err);
    }
  });
}

async function handleMessage(client: Client, config: Config, message: Message): Promise<void> {
  // Only act on our own messages.
  if (!client.user || message.author.id !== client.user.id) return;

  const content = message.content ?? "";
  const prefix = config.commandPrefix;

  // Must start with the prefix. Require either exactly the prefix or prefix
  // followed by whitespace, so "!grokfoo" doesn't trigger.
  if (!content.startsWith(prefix)) return;
  const rest = content.slice(prefix.length);
  if (rest.length > 0 && !/^\s/.test(rest)) return;

  const userPrompt = rest.trim();
  if (!userPrompt) return; // "!grok" with no prompt -> ignore

  // Gather recent channel context (excludes the trigger itself via before:id).
  const context = await fetchContext(message, config.contextMessageCount);
  const fullPrompt = buildPrompt(context, userPrompt);

  // Ask Grok (fast mode).
  let answer: string;
  try {
    const result = await askGrok(fullPrompt, "fast", {
      sso: config.grokSso,
      ssoRw: config.grokSsoRw,
      userAgent: config.grokUserAgent,
    });
    answer = stripCitations(result.text);
  } catch (err) {
    const msg = err instanceof GrokError ? err.message : `Grok request failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    try {
      await message.channel.send(`(grok error: ${msg})`);
    } catch { /* noop */ }
    return;
  }

  if (!answer) {
    console.error("Grok returned an empty answer after stripping.");
    return;
  }

  // Reply to the trigger message, chunked to fit Discord's limit. Only the
  // first chunk references the trigger; the rest are plain follow-ups.
  const chunks = chunkMessage(answer);
  let first = true;
  for (const chunk of chunks) {
    try {
      if (first) {
        await message.reply(chunk);
        first = false;
      } else {
        await message.channel.send(chunk);
      }
    } catch (err) {
      console.error("Failed to send Grok reply:", err);
      break;
    }
  }
}
