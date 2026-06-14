// Output formatting for Discord: strip Grok's citation markers and chunk long
// messages to fit Discord's 2000-character limit.

const DISCORD_MAX = 2000;

// Remove inline [1], [2], [1, 2] citation markers. Markdown is left as-is.
export function stripCitations(text: string): string {
  // Matches [1], [12], [1, 2], [1,2,3] etc.
  let out = text.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "");
  // Clean up spaces left before punctuation / doubled spaces from removal.
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/ +([.,!?;:])/g, "$1");
  out = out.replace(/[ \t]+\n/g, "\n");
  return out.trim();
}

// Split text into <=2000-char chunks, preferring to break on newlines, then
// spaces, so we don't cut words in half.
export function chunkMessage(text: string, max = DISCORD_MAX): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > max) {
    let slice = remaining.slice(0, max);
    // Prefer breaking at the last newline within the slice.
    let breakAt = slice.lastIndexOf("\n");
    if (breakAt < max * 0.5) {
      // No good newline; try the last space instead.
      const spaceAt = slice.lastIndexOf(" ");
      if (spaceAt > max * 0.5) breakAt = spaceAt;
      else breakAt = max; // give up, hard-cut
    }
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}
