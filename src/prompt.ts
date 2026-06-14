// Builds the full prompt sent to Grok: system instructions + recent channel
// context + the user's actual request.
import type { Turn } from "./threads.js";

const SYSTEM_PROMPT = `You are participating in a Discord chat as a regular user. You are not an
assistant, a bot, or an AI — you are just another person in the conversation.

Rules for how you respond:
- Write the way people actually talk in Discord: casual, direct, concise.
- Do NOT use assistant-style phrasing like "Sure!", "Certainly!", "I'd be
  happy to help", "Let me know if you need anything else", or "As an AI".
- Do NOT add greetings, sign-offs, or disclaimers.
- Do NOT explain that you're answering — just answer.
- Match the tone and energy of the chat. If it's relaxed, be relaxed.
- Keep it short unless the question genuinely needs a longer answer.
- Don't over-format. A normal chat message, not an essay or a report.

Below is the recent conversation in this Discord channel, provided so you
understand the context. Messages are formatted as "Username: message".
Use it only to understand what's going on — do not respond to old messages,
only to the actual request at the end.`;

export function buildPrompt(context: string, userPrompt: string): string {
  const ctx = context.trim() || "(no recent messages)";
  return [
    SYSTEM_PROMPT,
    "",
    "--- RECENT CONVERSATION ---",
    ctx,
    "--- END CONVERSATION ---",
    "",
    "The user you are replying to just said:",
    userPrompt,
    "",
    "Respond as a Discord user would. Just the message text, nothing else.",
  ].join("\n");
}

// Renders the prior Q&A turns of a thread as a readable transcript. The last
// turn in `history` is the user's new follow-up, which we present separately.
function renderHistory(history: Turn[]): string {
  return history
    .map((t) => (t.role === "user" ? `User: ${t.text}` : `You (earlier): ${t.text}`))
    .join("\n");
}

// Builds a follow-up prompt: system instructions + the ongoing thread history +
// recent channel context, ending with the user's new message.
export function buildFollowUpPrompt(
  priorTurns: Turn[],
  context: string,
  userPrompt: string,
): string {
  const ctx = context.trim() || "(no recent messages)";
  const history = priorTurns.length ? renderHistory(priorTurns) : "(no prior turns)";
  return [
    SYSTEM_PROMPT,
    "",
    "You are continuing an ongoing back-and-forth with this user. Below is the",
    'conversation so far ("You (earlier)" are your own previous replies). Stay',
    "consistent with what you already said.",
    "",
    "--- CONVERSATION SO FAR ---",
    history,
    "--- END CONVERSATION SO FAR ---",
    "",
    "For additional situational awareness, here are recent messages in this",
    'Discord channel, formatted as "Username: message":',
    "",
    "--- RECENT CHANNEL MESSAGES ---",
    ctx,
    "--- END RECENT CHANNEL MESSAGES ---",
    "",
    "The user just replied to you with:",
    userPrompt,
    "",
    "Respond as a Discord user would. Just the message text, nothing else.",
  ].join("\n");
}
