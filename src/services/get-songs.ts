import {inject, injectable} from 'inversify';
import * as spotifyURI from 'spotify-uri';
import {MediaSource, QueuedPlaylist, SongMetadata} from './player.js';
import {TYPES} from '../types.js';
import ffmpeg from 'fluent-ffmpeg';
import YoutubeAPI from './youtube-api.js';
import SpotifyAPI, {SpotifyTrack} from './spotify-api.js';
import SoundcloudAPI from './soundcloud-api.js';
import FileCacheProvider from './file-cache.js';
import {spawn} from 'child_process';
import {parseTime} from '../utils/time.js';
import debug from '../utils/debug.js';

@injectable()
export default class {
  constructor(@inject(TYPES.Services.YoutubeAPI) private readonly youtubeAPI: YoutubeAPI,
    @inject(TYPES.Services.SpotifyAPI) private readonly spotifyAPI: SpotifyAPI,
    @inject(TYPES.Services.SoundCloudAPI) private readonly soundcloudAPI: SoundcloudAPI,
    @inject(TYPES.FileCache) private readonly fileCacheProvider: FileCacheProvider,
  ) {
  }

  async youtubeVideoSearch(query: string, shouldSplitChapters: boolean): Promise<SongMetadata[]> {
    return this.youtubeAPI.search(query, shouldSplitChapters);
  }

  async youtubeVideo(url: string, shouldSplitChapters: boolean): Promise<SongMetadata[]> {
    return this.youtubeAPI.getVideo(url, shouldSplitChapters);
  }

  async youtubePlaylist(listId: string, shouldSplitChapters: boolean): Promise<SongMetadata[]> {
    return this.youtubeAPI.getPlaylist(listId, shouldSplitChapters);
  }

  async soundcloudVideoSearch(query: string): Promise<SongMetadata[]> {
    return this.soundcloudAPI.search(query);
  }

  async soundcloudVideo(url: string): Promise<SongMetadata[]> {
    return this.soundcloudAPI.get(url);
  }

  async soundcloudPlaylist(listId: string): Promise<SongMetadata[]> {
    return this.soundcloudAPI.getPlaylist(listId);
  }

  async soundcloudArtist(listId: string): Promise<SongMetadata[]> {
    return this.soundcloudAPI.getArtist(listId);
  }

  async cacheSource(query: string) {
    return Promise.all(query.split(';').map(async q => {
      const url = q.replace('cache::', '');
      const path = await this.fileCacheProvider.getPathFor(url);

      if (!path) {
        throw new Error(`Cache file "${url}" not found`);
      }

      const length = await this.getCacheFileDuration(path);
      return {
        url,
        source: MediaSource.Cache,
        isLive: false,
        title: `Cached Song (${url.substring(0, 8)})`,
        artist: 'Unknown Artist',
        length,
        offset: 0,
        playlist: null,
        thumbnailUrl: null,
      };
    }));
  }

  async getCacheFileDuration(path: string) {
    return new Promise<number>(resolve => {
      const ffmpegTime = spawn('ffmpeg', ['-i', path, '-f', 'null', '/dev/null']);

      let stderr = '';
      ffmpegTime.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      ffmpegTime.on('close', (code: number) => {
        if (code === 0) {
          try {
            // The regex pattern equivalent to [0-9]{1}:[0-9]{2}:[0-9]{2}
            const pattern = /[0-9]{1}:[0-9]{2}:[0-9]{2}/g;

            // Get all matches
            const matches = stderr.match(pattern);

            // Return the last match or null if no matches found
            resolve(matches ? parseTime(matches[matches.length - 1]) ?? 0 : 0);
          } catch (parseError: unknown) {
            debug(`Failed to parse ffmpeg output: ${String(parseError)}`);
            resolve(0);
          }
        } else {
          debug(`ffmpeg failed with code ${code}: ${stderr}`);
          resolve(0);
        }
      });

      ffmpegTime.on('error', (error: Error) => {
        debug(`Failed to spawn ffmpeg: ${error.message}`);
        resolve(0);
      });
    });
  }

  async spotifySource(url: string, playlistLimit: number, shouldSplitChapters: boolean): Promise<[SongMetadata[], number, number]> {
    const parsed = spotifyURI.parse(url);

    switch (parsed.type) {
      case 'album': {
        const [tracks, playlist] = await this.spotifyAPI.getAlbum(url, playlistLimit);
        return this.spotifyToYouTube(tracks, shouldSplitChapters, playlist);
      }

      case 'playlist': {
        const [tracks, playlist] = await this.spotifyAPI.getPlaylist(url, playlistLimit);
        return this.spotifyToYouTube(tracks, shouldSplitChapters, playlist);
      }

      case 'track': {
        const tracks = [await this.spotifyAPI.getTrack(url)];
        return this.spotifyToYouTube(tracks, shouldSplitChapters);
      }

      case 'artist': {
        const tracks = await this.spotifyAPI.getArtist(url, playlistLimit);
        return this.spotifyToYouTube(tracks, shouldSplitChapters);
      }

      default: {
        return [[], 0, 0];
      }
    }
  }

  async httpLiveStream(url: string): Promise<SongMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg(url).ffprobe((err, _) => {
        if (err) {
          reject();
        }

        resolve({
          url,
          source: MediaSource.HLS,
          isLive: true,
          title: url,
          artist: url,
          length: 0,
          offset: 0,
          playlist: null,
          thumbnailUrl: null,
        });
      });
    });
  }

  private async spotifyToYouTube(tracks: SpotifyTrack[], shouldSplitChapters: boolean, playlist?: QueuedPlaylist | undefined): Promise<[SongMetadata[], number, number]> {
    const promisedResults = tracks.map(async track => this.youtubeAPI.search(`"${track.name}" "${track.artist}"`, shouldSplitChapters));
    const searchResults = await Promise.allSettled(promisedResults);

    let nSongsNotFound = 0;

    // Count songs that couldn't be found
    const songs: SongMetadata[] = searchResults.reduce((accum: SongMetadata[], result) => {
      if (result.status === 'fulfilled') {
        for (const v of result.value) {
          accum.push({
            ...v,
            ...(playlist ? {playlist} : {}),
          });
        }
      } else {
        nSongsNotFound++;
      }

      return accum;
    }, []);

    return [songs, nSongsNotFound, tracks.length];
  }
}
