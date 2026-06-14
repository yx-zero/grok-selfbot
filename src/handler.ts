// Handles incoming messages: detects the !grok command (fresh question) and
// follow-up replies to previous Grok answers, gathers context, asks Grok, and
// posts the reply.
import type { Client, Message } from "discord.js-selfbot-v13";
import type { Config } from "./config.js";
import { fetchContext } from "./context.js";
import { buildPrompt, buildFollowUpPrompt } from "./prompt.js";
import { askGrok, GrokError } from "./grok/client.js";
import { stripCitations, chunkMessage } from "./format.js";
import { saveThread, getThread, type Turn } from "./threads.js";

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

  // Follow-up: a reply to a previous Grok answer takes priority over the prefix.
  const repliedToId = message.reference?.messageId;
  if (repliedToId) {
    const priorTurns = getThread(repliedToId);
    if (priorTurns) {
      await handleFollowUp(config, message, priorTurns);
      return;
    }
  }

  // Fresh question: "!grok <prompt>".
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

  const history: Turn[] = [{ role: "user", text: userPrompt }];
  await askAndReply(config, message, fullPrompt, history);
}

async function handleFollowUp(config: Config, message: Message, priorTurns: Turn[]): Promise<void> {
  const userPrompt = (message.content ?? "").trim();
  if (!userPrompt) return; // empty reply -> ignore

  // Keep only the most recent turns (1 turn = user msg + grok reply = 2 entries).
  const trimmed = trimHistory(priorTurns, config.maxHistoryTurns);

  const context = await fetchContext(message, config.contextMessageCount);
  const fullPrompt = buildFollowUpPrompt(trimmed, context, userPrompt);

  const history: Turn[] = [...trimmed, { role: "user", text: userPrompt }];
  await askAndReply(config, message, fullPrompt, history);
}

// Sends `fullPrompt` to Grok, replies to `message`, and records the thread so
// follow-up replies to our answer continue the conversation. `history` is the
// conversation up to and including the user's latest message.
async function askAndReply(
  config: Config,
  message: Message,
  fullPrompt: string,
  history: Turn[],
): Promise<void> {
  // Append a "[responding]" indicator to the trigger message while we wait, then
  // restore the original text once done (on success or error).
  const originalContent = message.content ?? "";
  const marked = await setResponding(message, originalContent);

  let answer: string;
  try {
    const result = await askGrok(fullPrompt, "fast", {
      sso: config.grokSso,
      ssoRw: config.grokSsoRw,
      userAgent: config.grokUserAgent,
    });
    answer = stripCitations(result.text);
  } catch (err) {
    if (marked) await restoreOriginal(message, originalContent);
    const msg = err instanceof GrokError ? err.message : `Grok request failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    try {
      await message.channel.send(`(grok error: ${msg})`);
    } catch { /* noop */ }
    return;
  }

  if (marked) await restoreOriginal(message, originalContent);

  if (!answer) {
    console.error("Grok returned an empty answer after stripping.");
    return;
  }

  const fullHistory: Turn[] = [...history, { role: "grok", text: answer }];

  // Reply to the trigger message, chunked to fit Discord's limit. Only the
  // first chunk references the trigger; the rest are plain follow-ups. We track
  // every sent message ID so replying to any chunk continues the thread.
  const chunks = chunkMessage(answer);
  let first = true;
  for (const chunk of chunks) {
    try {
      const sent = first ? await message.reply(chunk) : await message.channel.send(chunk);
      first = false;
      saveThread(sent.id, fullHistory);
    } catch (err) {
      console.error("Failed to send Grok reply:", err);
      break;
    }
  }
}

const RESPONDING_SUFFIX = " [responding]";

// Append the "[responding]" indicator to the trigger message. Returns true if
// the edit succeeded (so we know to restore it later).
async function setResponding(message: Message, originalContent: string): Promise<boolean> {
  try {
    await message.edit(originalContent + RESPONDING_SUFFIX);
    return true;
  } catch (err) {
    console.error("Failed to set [responding] indicator:", err);
    return false;
  }
}

// Restore the trigger message back to its original text.
async function restoreOriginal(message: Message, originalContent: string): Promise<void> {
  try {
    await message.edit(originalContent);
  } catch (err) {
    console.error("Failed to restore original message text:", err);
  }
}

// Keep at most `maxTurns` turns. One turn = a user entry + the grok entry that
// followed it, so we keep the last `maxTurns * 2` entries.
function trimHistory(history: Turn[], maxTurns: number): Turn[] {
  const maxEntries = maxTurns * 2;
  if (history.length <= maxEntries) return history;
  return history.slice(history.length - maxEntries);
}
