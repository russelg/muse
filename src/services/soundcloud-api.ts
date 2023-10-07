import {inject, injectable} from 'inversify';
import {TYPES} from '../types';
import Config from './config';
import {MediaSource, QueuedPlaylist, SongMetadata} from './player';
import {
  API,
  Apps,
  Comments,
  Me,
  Oembed,
  Playlists,
  Resolve,
  SoundcloudOptions,
  SoundcloudTrackV2,
  Tracks,
  Users,
  Util,
} from 'soundcloud.ts';

class Soundcloud {
  public static clientId?: string;
  public static oauthToken?: string;
  public static proxy?: string;
  public api: API;
  public apps: Apps = new Apps(this);
  public comments: Comments = new Comments(this);
  public me: Me = new Me(this);
  public oembed: Oembed = new Oembed(this);
  public playlists: Playlists = new Playlists(this);
  public resolve: Resolve = new Resolve(this);
  public tracks: Tracks = new Tracks(this);
  public users: Users = new Users(this);
  public util: Util = new Util(this);

  public constructor(options?: SoundcloudOptions) {
    const opts: SoundcloudOptions = options ?? {};
    if (opts.clientId) {
      Soundcloud.clientId = opts.clientId;
      if (opts.oauthToken) {
        Soundcloud.oauthToken = opts.oauthToken;
      }
    }

    if (opts.proxy) {
      Soundcloud.proxy = opts.proxy;
    }

    this.api = new API(Soundcloud.clientId, Soundcloud.oauthToken, Soundcloud.proxy);
  }
}

@injectable()
export default class {
  private readonly soundcloudKey: string;
  private readonly soundcloudClient: Soundcloud;

  constructor(@inject(TYPES.Config) config: Config) {
    this.soundcloudKey = config.SOUNDCLOUD_CLIENT_ID;
    this.soundcloudClient = new Soundcloud({
      clientId: this.soundcloudKey,
    });
  }

  async getPlaylist(url: string): Promise<Array<SongMetadata | null>> {
    const playlist = await this.soundcloudClient.playlists.getV2(url);
    if (!playlist) {
      throw new Error('Playlist could not be found.');
    }

    const queuedPlaylist = {title: playlist.title, source: playlist.permalink_url};

    return Promise.all(playlist.tracks.map(async track => {
      const streamUrl = await this.soundcloudClient.util.streamLink(track.permalink_url, 'hls');
      if (!streamUrl) {
        return null;
      }

      return this.transformTrack(track, track.permalink_url, streamUrl, queuedPlaylist);
    }));
  }

  async getSong(url: string): Promise<SongMetadata> {
    const track = await this.soundcloudClient.tracks.getV2(url);
    if (!track) {
      throw new Error('Song could not be found.');
    }

    const streamUrl = await this.soundcloudClient.util.streamLink(url, 'hls');
    if (!streamUrl) {
      throw new Error('Song Stream URL could not be found.');
    }

    return this.transformTrack(track, url, streamUrl);
  }

  private transformTrack(track: SoundcloudTrackV2, url: string, streamUrl: string, queuedPlaylist: QueuedPlaylist | null = null) {
    return {
      source: MediaSource.SoundCloud,
      title: track.title,
      artist: track.user.username,
      length: Math.ceil(track.full_duration / 1_000),
      offset: 0,
      url: streamUrl,
      originalUrl: url,
      playlist: queuedPlaylist,
      isLive: false,
      thumbnailUrl: track.artwork_url,
    };
  }
}
