// In-memory store mapping a bot answer message ID to the conversation history
// that produced it. Lets follow-up replies continue a Grok thread.
// Reset on restart; capped to bound memory.

export type Turn = { role: "user" | "grok"; text: string };

const MAX_THREADS = 500;

// Insertion-ordered Map: when we exceed MAX_THREADS, evict the oldest entry.
const store = new Map<string, Turn[]>();

// Record that `answerMessageId` (a message the bot just sent) corresponds to
// the given conversation history (ending with the Grok answer).
export function saveThread(answerMessageId: string, history: Turn[]): void {
  if (store.has(answerMessageId)) store.delete(answerMessageId);
  store.set(answerMessageId, history);
  while (store.size > MAX_THREADS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

// Look up the history for a message the user replied to. Returns undefined if
// it's not a tracked Grok answer (e.g. sent before a restart).
export function getThread(messageId: string): Turn[] | undefined {
  return store.get(messageId);
}
