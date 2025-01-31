import dotenv from 'dotenv';
import 'reflect-metadata';
import {injectable} from 'inversify';
import path from 'path';
import xbytes from 'xbytes';
import {ConditionalKeys} from 'type-fest';
import {ActivityType, PresenceStatusData} from 'discord.js';
dotenv.config();

export const DATA_DIR = path.resolve(process.env.DATA_DIR ? process.env.DATA_DIR : './data');

const CONFIG_MAP = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
  SOUNDCLOUD_OAUTH_TOKEN: process.env.SOUNDCLOUD_OAUTH_TOKEN,
  WEBSERVER_PORT: process.env.WEBSERVER_PORT ?? 80,
  WEBSERVER_PASSWORD: process.env.WEBSERVER_PASSWORD ?? '',
  HTTP_PROXY: process.env.HTTP_PROXY,
  REGISTER_COMMANDS_ON_BOT: process.env.REGISTER_COMMANDS_ON_BOT === 'true',
  DATA_DIR,
  CACHE_DIR: path.join(DATA_DIR, 'cache'),
  CACHE_LIMIT_IN_BYTES: xbytes.parseSize(process.env.CACHE_LIMIT ?? '2GB'),
  CACHE_DURATION_LIMIT_SECONDS: process.env.CACHE_DURATION_LIMIT_SECONDS ?? (30 * 60),
  BOT_NAME: process.env.BOT_NAME ?? 'fartbot',
  BOT_STATUS: process.env.BOT_STATUS ?? 'online',
  BOT_ACTIVITY_TYPE: process.env.BOT_ACTIVITY_TYPE ?? 'LISTENING',
  BOT_ACTIVITY_URL: process.env.BOT_ACTIVITY_URL ?? '',
  BOT_ACTIVITY: process.env.BOT_ACTIVITY ?? 'music',
  ENABLE_SPONSORBLOCK: process.env.ENABLE_SPONSORBLOCK === 'true',
  SPONSORBLOCK_TIMEOUT: process.env.ENABLE_SPONSORBLOCK ?? 5,
} as const;

const BOT_ACTIVITY_TYPE_MAP = {
  PLAYING: ActivityType.Playing,
  LISTENING: ActivityType.Listening,
  WATCHING: ActivityType.Watching,
  STREAMING: ActivityType.Streaming,
} as const;

@injectable()
export default class Config {
  readonly DISCORD_TOKEN!: string;
  readonly WEBSERVER_PORT!: number;
  readonly WEBSERVER_PASSWORD!: string;
  readonly HTTP_PROXY!: string;
  readonly YOUTUBE_API_KEY!: string;
  readonly SPOTIFY_CLIENT_ID!: string;
  readonly SPOTIFY_CLIENT_SECRET!: string;
  readonly SOUNDCLOUD_CLIENT_ID!: string;
  readonly SOUNDCLOUD_OAUTH_TOKEN!: string;
  readonly REGISTER_COMMANDS_ON_BOT!: boolean;
  readonly DATA_DIR!: string;
  readonly CACHE_DIR!: string;
  readonly CACHE_LIMIT_IN_BYTES!: number;
  readonly CACHE_DURATION_LIMIT_SECONDS!: number;
  readonly BOT_NAME!: string;
  readonly BOT_STATUS!: PresenceStatusData;
  readonly BOT_ACTIVITY_TYPE!: Exclude<ActivityType, ActivityType.Custom>;
  readonly BOT_ACTIVITY_URL!: string;
  readonly BOT_ACTIVITY!: string;
  readonly ENABLE_SPONSORBLOCK!: boolean;
  readonly SPONSORBLOCK_TIMEOUT!: number;

  constructor() {
    for (const [key, value] of Object.entries(CONFIG_MAP)) {
      if (typeof value === 'undefined') {
        console.error(`Missing environment variable for ${key}`);
        process.exit(1);
      }

      if (key === 'BOT_ACTIVITY_TYPE') {
        this[key] = BOT_ACTIVITY_TYPE_MAP[(value as string).toUpperCase() as keyof typeof BOT_ACTIVITY_TYPE_MAP];
        continue;
      }

      if (typeof value === 'number') {
        this[key as ConditionalKeys<typeof CONFIG_MAP, number>] = value;
      } else if (typeof value === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (this as any)[key] = value.trim();
      } else if (typeof value === 'boolean') {
        this[key as ConditionalKeys<typeof CONFIG_MAP, boolean>] = value;
      } else {
        throw new Error(`Unsupported type for ${key}`);
      }
    }
  }
}
