# grok-selfbot

A Discord **selfbot** that lets you talk to [Grok](https://grok.com) directly inside Discord. Type `!grok <your prompt>` in any channel, DM, or group chat, and the bot sends your message — along with recent channel context — to Grok and replies with the answer.

Grok answers as if it were a regular Discord user (casual, no assistant-speak), with web search enabled and citations stripped from the output.

> [!WARNING]
> Selfbots (automating a **user** account) violate Discord's Terms of Service and can get your account banned. Use at your own risk, preferably on a throwaway account. This project is for educational purposes.

## How it works

1. The selfbot logs in with your Discord **user token** and listens to your own messages everywhere (servers, DMs, group DMs).
2. When you send a message starting with `!grok `, it:
   - Fetches the last **50 messages** in that channel as conversation context.
   - Builds a prompt = system instructions ("respond like a Discord user") + context + your prompt.
   - Sends it to Grok's web-search-backed API (`fast` mode).
   - **Replies** to your `!grok` message with Grok's answer (markdown preserved, `[n]` citation markers removed).
3. Long answers are split across multiple messages to fit Discord's 2000-character limit.

It only reacts to **your own** messages — not other users'.

## Requirements

- **Node.js 18+** (uses the built-in `node:http2`)
- A Discord **user token**
- A Grok **`sso` session cookie** from a logged-in [grok.com](https://grok.com) session

## Installation

```bash
git clone https://github.com/yx-zero/grok-selfbot.git
cd grok-selfbot
npm install
npm run build
```

## Configuration

Copy the example config and fill it in:

```bash
cp config.example.json config.json
```

```json
{
  "discordToken": "your-discord-user-token-here",
  "grokSso": "your-grok-sso-cookie-here",
  "grokSsoRw": "",
  "grokUserAgent": "",
  "commandPrefix": "!grok",
  "contextMessageCount": 50
}
```

| Field                 | Required | Description                                                              |
| --------------------- | -------- | ------------------------------------------------------------------------ |
| `discordToken`        | **yes**  | Your Discord user account token.                                         |
| `grokSso`             | **yes**  | The `sso` session cookie value from grok.com.                            |
| `grokSsoRw`           | no       | The `sso-rw` cookie; defaults to `grokSso` if empty.                     |
| `grokUserAgent`       | no       | Override the User-Agent sent to Grok.                                     |
| `commandPrefix`       | no       | The trigger prefix. Defaults to `!grok`.                                  |
| `contextMessageCount` | no       | How many recent messages to include as context. Defaults to `50`.        |

> [!IMPORTANT]
> `config.json` holds two **credentials** — treat them like passwords. It is gitignored by default, so it never gets committed. Don't share it, don't paste it into public issues.

### Getting your Discord user token

> [!CAUTION]
> Never share your token. Anyone with it has full access to your account.

1. Open Discord in your **browser** (or the desktop app) and log in.
2. Open **DevTools** (`F12` or `Ctrl+Shift+I`).
3. Go to the **Network** tab.
4. Perform an action that makes a request (e.g. click a channel).
5. Filter requests by `api` and click one (e.g. `messages`, `science`).
6. In **Request Headers**, find the **`authorization`** header — its value is your token.

### Getting your Grok `sso` cookie

1. Go to **https://grok.com** and make sure you're **logged in**.
2. Open **DevTools** (`F12`).
3. Open the **Application** tab → **Cookies** → `https://grok.com`.
4. Find the row named **`sso`** and copy its **Value** (a long JWT starting with `eyJ...`).

That value is your `grokSso`. The cookie expires periodically; when it does, re-harvest it.

## Running

```bash
npm start
```

You should see:

```
Logged in as your_username
Listening for "!grok <prompt>" on your own messages.
Context depth: 50 messages. Grok mode: fast.
```

Then go to Discord and try:

```
!grok what's the latest stable node.js release?
```

After editing the source, rebuild and restart:

```bash
npm run build && npm start
```

## Project structure

```
grok-selfbot/
├─ config.example.json     # template config (copy to config.json)
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ index.ts             # entry point: login + wiring
   ├─ config.ts            # loads config.json
   ├─ handler.ts           # !grok detection, context, reply
   ├─ context.ts           # fetch + format recent messages
   ├─ prompt.ts            # the system prompt
   ├─ format.ts            # strip citations + chunk to 2000 chars
   └─ grok/                # Grok HTTP/2 gRPC client
      ├─ client.ts
      ├─ parse.ts
      ├─ protobuf.ts
      └─ types.ts
```

## Notes

- Every Grok request runs in **incognito** (temporary chat), so nothing is saved to your Grok history.
- **Web search is always on**, so Grok can answer with live information.
- The Grok client talks to grok.com directly over HTTP/2 using your own session cookie — it does not bypass authentication.

## License

MIT
