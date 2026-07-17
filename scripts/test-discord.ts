#!/usr/bin/env bun
/**
 * Discord-Side Integration Test Harness
 *
 * Tests the bot's Discord integration using Discord's REST API directly.
 * Verifies command registration, guild presence, voice channels, and
 * the bot's ability to respond to voice-related slash commands.
 *
 * Requires:
 *   - Bot is running (`bun run dev`)
 *   - Bot is in the target guild
 *   - DISCORD_TOKEN, GUILD_ID, WEBSERVER_PASSWORD in .env
 *
 * Usage:
 *   bun run scripts/test-discord.ts [guild-id] [api-password]
 */

import dotenv from "dotenv";
import path from "path";
import { REST } from "@discordjs/rest";
import { Routes, type RESTGetAPIApplicationGuildCommandsResult } from "discord-api-types/v10";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const GUILD = process.argv[2] ?? process.env.GUILD_ID ?? "";
const BOT_API = `http://localhost:${process.env.WEBSERVER_PORT ?? 5000}`;
const BOT_PASSWORD = process.argv[3] ?? process.env.WEBSERVER_PASSWORD ?? "";

const CHANNEL_TYPE = { GUILD_VOICE: 2 } as const;

// ---------------------------------------------------------------------------
// Discord REST
// ---------------------------------------------------------------------------

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

async function discordGet<T>(path: `/${string}`): Promise<T> {
  return rest.get(path) as Promise<T>;
}

interface DiscordUser {
  id: string;
  username: string;
  bot: boolean;
}

interface DiscordGuildChannel {
  id: string;
  name: string;
  type: number;
}

interface DiscordMember {
  user?: { id: string };
  deaf: boolean;
  mute: boolean;
}

// ---------------------------------------------------------------------------
// Bot REST API
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

async function botGet(path: string): Promise<Json> {
  const r = await fetch(`${BOT_API}${path}`);
  return r.json() as Promise<Json>;
}

async function botPost(path: string, body?: Json): Promise<Json> {
  const r = await fetch(`${BOT_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json() as Promise<Json>;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

type Test = { name: string; run: () => Promise<void> };

async function runTests(tests: Test[]): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  for (const { name, run } of tests) {
    process.stdout.write(`  ${name}... `);
    try {
      await run();
      console.log("PASS");
      passed++;
    } catch (err: unknown) {
      console.log(`FAIL — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  return { passed, failed };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function main() {
  if (!GUILD || !DISCORD_TOKEN) {
    console.error("Usage: bun run scripts/test-discord.ts <guild-id> [api-password]");
    console.error("  Requires DISCORD_TOKEN, GUILD_ID, WEBSERVER_PASSWORD in .env");
    process.exit(2);
  }

  // ---- Phase 0: Identify the bot ----
  console.log("=== Bot Identity ===\n");
  let appId: string;
  try {
    const user = await discordGet<DiscordUser>("/users/@me");
    appId = user.id;
    assert(user.bot !== false, "DISCORD_TOKEN is not a bot token");
    console.log(`  Bot: @${user.username}  ID: ${appId}\n`);
  } catch (err: unknown) {
    console.error("❌ Failed Discord auth — is DISCORD_TOKEN valid?");
    process.exit(1);
  }

  // ---- Phase 1: Guild & Bot Presence ----
  console.log("=== Guild & Presence ===\n");

  await runTests([
    {
      name: "bot is member of guild",
      run: async () => {
        // If bot is in guild, this succeeds; if not, Discord returns 404
        await discordGet(`/guilds/${GUILD}/members/${appId}`);
      },
    },
    {
      name: "guild has voice channels",
      run: async () => {
        const channels = await discordGet<DiscordGuildChannel[]>(`/guilds/${GUILD}/channels`);
        const voice = channels.filter((c) => c.type === CHANNEL_TYPE.GUILD_VOICE);
        assert(voice.length > 0, "no voice channels found");
      },
    },
    {
      name: "bot is reachable via internal API",
      run: async () => {
        const r = await botGet(`/np/${GUILD}`);
        assert(r.success === true, "bot API unreachable");
      },
    },
  ]);

  // ---- Phase 2: Slash Commands ----
  console.log("\n=== Slash Commands ===\n");

  const REQUIRED_COMMANDS = [
    "play", "skip", "pause", "resume", "stop", "disconnect",
    "loop", "loop-queue", "shuffle", "clear", "remove",
    "move", "now-playing", "queue", "replay", "unskip",
    "seek", "fseek", "volume", "config", "favorites", "next",
  ];

  await runTests([
    {
      name: "slash commands registered in guild",
      run: async () => {
        const cmds = await discordGet<RESTGetAPIApplicationGuildCommandsResult>(
          Routes.applicationGuildCommands(appId, GUILD),
        );
        assert(cmds.length >= 5, `only ${cmds.length} commands registered`);
      },
    },
    {
      name: "all required voice commands present",
      run: async () => {
        const cmds = await discordGet<RESTGetAPIApplicationGuildCommandsResult>(
          Routes.applicationGuildCommands(appId, GUILD),
        );
        const names = new Set(cmds.map((c) => c.name));
        const missing = REQUIRED_COMMANDS.filter((r) => !names.has(r));
        assert(missing.length === 0, `missing: ${missing.join(", ")}`);
      },
    },
    {
      name: "/play has query, immediate, shuffle, split, skip options",
      run: async () => {
        const cmds = await discordGet<RESTGetAPIApplicationGuildCommandsResult>(
          Routes.applicationGuildCommands(appId, GUILD),
        );
        const play = cmds.find((c) => c.name === "play");
        assert(!!play, "/play command not found");
        const optNames = new Set(play!.options?.map((o) => o.name) ?? []);
        for (const opt of ["query", "immediate", "shuffle", "split", "skip"]) {
          assert(optNames.has(opt), `/play missing option "${opt}"`);
        }
      },
    },
    {
      name: "/skip has number option",
      run: async () => {
        const cmds = await discordGet<RESTGetAPIApplicationGuildCommandsResult>(
          Routes.applicationGuildCommands(appId, GUILD),
        );
        const skip = cmds.find((c) => c.name === "skip");
        assert(!!skip, "/skip command not found");
        const optNames = new Set(skip!.options?.map((o) => o.name) ?? []);
        assert(optNames.has("number"), '/skip missing option "number"');
      },
    },
  ]);

  // ---- Phase 3: Voice Interactions via Bot API ----
  console.log("\n=== Voice Interactions (via bot API) ===\n");

  const GOOD_SONG = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const BAD_SONG = "https://www.youtube.com/watch?v=MWPxitu4ZT4";

  await runTests([
    {
      name: "/play adds song to queue",
      run: async () => {
        const r = await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: GOOD_SONG,
          immediate: true,
        });
        assert(r.success === true, String(r.error));
      },
    },
    {
      name: "/skip handles unavailable video (no crash)",
      run: async () => {
        await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: GOOD_SONG,
          immediate: true,
        });
        await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: BAD_SONG,
          immediate: false,
        });
        await botPost(`/skip/${GUILD}/${BOT_PASSWORD}`);

        // Must still be reachable
        const alive = await botGet(`/np/${GUILD}`).then(() => true, () => false);
        assert(alive, "bot crashed after skip to unavailable video");
      },
    },
    {
      name: "consecutive bad tracks don't crash",
      run: async () => {
        const BAD_2 = "https://www.youtube.com/watch?v=E3RiJGexoMo";
        await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: GOOD_SONG,
          immediate: true,
        });
        await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: BAD_SONG,
          immediate: false,
        });
        await botPost(`/play/${GUILD}/${BOT_PASSWORD}`, {
          query: BAD_2,
          immediate: false,
        });
        await botPost(`/skip/${GUILD}/${BOT_PASSWORD}`);
        await botPost(`/skip/${GUILD}/${BOT_PASSWORD}`);

        const alive = await botGet(`/np/${GUILD}`).then(() => true, () => false);
        assert(alive, "bot crashed after consecutive bad tracks");
      },
    },
    {
      name: "/unskip doesn't crash",
      run: async () => {
        await botPost(`/unskip/${GUILD}/${BOT_PASSWORD}`);
        const alive = await botGet(`/np/${GUILD}`).then(() => true, () => false);
        assert(alive, "bot crashed on unskip");
      },
    },
  ]);

  // ---- Phase 4: Vocal Channel Discovery ----
  console.log("\n=== Voice Channel Info ===\n");

  const channels = await discordGet<DiscordGuildChannel[]>(`/guilds/${GUILD}/channels`);
  const voiceChannels = channels.filter((c) => c.type === CHANNEL_TYPE.GUILD_VOICE);
  for (const vc of voiceChannels) {
    const count = await discordGet<DiscordMember[]>(`/channels/${vc.id}/voice-states`)
      .then((states) => states?.length ?? 0)
      .catch(() => "?");
    console.log(`  #${vc.name} (${vc.id}) — ${count} members`);
  }

  // ---- Summary ----
  console.log("\n=== Complete ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
