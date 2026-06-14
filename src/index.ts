// Discord selfbot entry point: logs in and wires up the !grok handler.
import { Client } from "discord.js-selfbot-v13";
import { loadConfig } from "./config.js";
import { registerHandler } from "./handler.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const client = new Client();

  client.on("ready", () => {
    const tag = client.user?.tag ?? "unknown";
    console.log(`Logged in as ${tag}`);
    console.log(`Listening for "${config.commandPrefix} <prompt>" on your own messages.`);
    console.log(`Context depth: ${config.contextMessageCount} messages. Grok mode: fast.`);
  });

  registerHandler(client, config);

  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
