// Fetches recent messages from a channel and formats them as context for Grok.
import type { Message } from "discord.js-selfbot-v13";

// A reasonable display name for an author: prefer global/display name, fall back
// to username.
function authorName(msg: Message): string {
  const u = msg.author;
  return u.globalName?.trim() || u.username || "Unknown";
}

// Flatten a message into a single context line. Strips newlines so each message
// stays on one "Username: message" line.
function formatLine(msg: Message): string | null {
  let content = msg.content?.trim();
  if (!content) {
    // Represent non-text messages so the conversation flow still makes sense.
    if (msg.attachments.size > 0) content = "[attachment]";
    else if (msg.embeds.length > 0) content = "[embed]";
    else if (msg.stickers.size > 0) content = "[sticker]";
    else return null; // nothing useful to show
  }
  const flat = content.replace(/\s*\n\s*/g, " ").trim();
  return `${authorName(msg)}: ${flat}`;
}

// Fetch up to `count` recent messages before `triggerMessage` and return them as
// a chronological (oldest -> newest) "Username: message" block.
export async function fetchContext(triggerMessage: Message, count: number): Promise<string> {
  let collected: Message[] = [];
  try {
    const fetched = await triggerMessage.channel.messages.fetch({
      limit: count,
      before: triggerMessage.id,
    });
    // fetch() returns newest-first; reverse to chronological order.
    collected = [...fetched.values()].reverse();
  } catch {
    // If we can't fetch history (e.g. permissions), fall back to no context.
    return "";
  }

  const lines: string[] = [];
  for (const msg of collected) {
    const line = formatLine(msg);
    if (line) lines.push(line);
  }
  return lines.join("\n");
}
