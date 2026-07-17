#!/usr/bin/env bun
/**
 * Muse Voice Command Test Harness
 *
 * Uses the bot's REST API to test voice-related slash commands.
 * Run against a running `bun run dev` instance.
 *
 * Usage:
 *   bun run scripts/test-harness.ts [guild-id] [password]
 *
 * Environment fallbacks from .env:
 *   GUILD_ID, WEBSERVER_PASSWORD, WEBSERVER_PORT (default 5000)
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BASE = process.env.API_URL ?? `http://localhost:${process.env.WEBSERVER_PORT ?? 5000}`;
const GUILD = process.argv[2] ?? process.env.GUILD_ID ?? "";
const PASSWORD = process.argv[3] ?? process.env.WEBSERVER_PASSWORD ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonResp = Record<string, unknown>;

async function get(path: string): Promise<JsonResp> {
  const r = await fetch(`${BASE}${path}`);
  return r.json() as Promise<JsonResp>;
}

async function post(path: string, body?: Record<string, unknown>): Promise<JsonResp> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json() as Promise<JsonResp>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Command wrappers
// ---------------------------------------------------------------------------

async function play(query: string, opts?: { immediate?: boolean; skip?: boolean }): Promise<JsonResp> {
  return post(`/play/${GUILD}/${PASSWORD}`, {
    query,
    immediate: opts?.immediate,
    skipCurrentTrack: opts?.skip,
  });
}

async function skip(): Promise<JsonResp> {
  return post(`/skip/${GUILD}/${PASSWORD}`);
}

async function unskip(): Promise<JsonResp> {
  return post(`/unskip/${GUILD}/${PASSWORD}`);
}

async function status(): Promise<JsonResp> {
  return get(`/np/${GUILD}`);
}

async function isPlaying(): Promise<boolean> {
  const s = await status();
  return s.statusText === "Now Playing";
}

function npTitle(s: JsonResp): string | null {
  return (s.np as Record<string, unknown> | null)?.title as string | null;
}

// ---------------------------------------------------------------------------
// Test assertions
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const GOOD_SONG = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const BAD_SONG = "https://www.youtube.com/watch?v=MWPxitu4ZT4";

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

async function testApiReachable() {
  await status();
  // No throw = reachable
}

async function testPlayAddsSong() {
  const r = await play(GOOD_SONG, { immediate: true });
  assert(r.success === true, `play failed: ${String(r.error ?? "unknown")}`);

  const s = await status();
  const qSize = (s.stats as Record<string, unknown>)?.size as number;
  assert(qSize > 0 || npTitle(s) !== null, "song was not added to queue");
}

async function testSkipDoesNotCrashOnBadUrl() {
  // Add good song, then bad song, then skip forward to hit the bad URL.
  // The bot must survive regardless of whether the skip succeeds or fails.
  await play(GOOD_SONG, { immediate: true });
  await play(BAD_SONG, { immediate: false });

  await skip();

  // Verify bot is still alive
  const alive = await status().then(() => true, () => false);
  assert(alive, "bot crashed after skipping to unavailable video!");
}

async function testUnskipDoesNotCrash() {
  await unskip();
  const alive = await status().then(() => true, () => false);
  assert(alive, "bot crashed after unskip");
}

async function testConsecutiveBadTracksDontCrash() {
  const BAD_2 = "https://www.youtube.com/watch?v=E3RiJGexoMo";

  // Queue: good → bad → bad → good
  await play(GOOD_SONG, { immediate: true });
  await play(BAD_SONG, { immediate: false });
  await play(BAD_2, { immediate: false });
  await play(GOOD_SONG, { immediate: false });

  // Skip twice — both should hit bad URLs
  await skip();
  await skip();

  const alive = await status().then(() => true, () => false);
  assert(alive, "bot crashed after skipping past consecutive unavailable videos!");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const TESTS: Array<{ name: string; run: () => Promise<void> }> = [
  { name: "API is reachable", run: testApiReachable },
  { name: "play adds a song to the queue", run: testPlayAddsSong },
  { name: "skip doesn't crash on unavailable video", run: testSkipDoesNotCrashOnBadUrl },
  { name: "consecutive bad tracks don't crash", run: testConsecutiveBadTracksDontCrash },
  { name: "unskip doesn't crash", run: testUnskipDoesNotCrash },
];

async function main() {
  if (!GUILD || !PASSWORD) {
    console.error("Usage: bun run scripts/test-harness.ts <guild-id> <password>");
    console.error("  or set GUILD_ID and WEBSERVER_PASSWORD in .env");
    process.exit(2);
  }

  console.log(`Muse Test Harness\n  Guild: ${GUILD}\n  API: ${BASE}\n`);

  try {
    await status();
    console.log("✅ Bot is reachable\n");
  } catch {
    console.error("❌ Bot is not running. Start with: bun run dev");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    process.stdout.write(`  ${test.name}... `);
    try {
      await test.run();
      console.log("PASS");
      passed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL — ${msg}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
