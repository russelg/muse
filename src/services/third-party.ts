import {inject, injectable} from 'inversify';
import SpotifyWebApi from 'spotify-web-api-node';
import pRetry from 'p-retry';
import {TYPES} from '../types.js';
import Config from './config.js';
import {Soundcloud} from 'soundcloud.ts';

@injectable()
export default class ThirdParty {
  readonly spotify: SpotifyWebApi;
  readonly soundcloud: Soundcloud;

  private spotifyTokenTimerId?: NodeJS.Timeout;

  constructor(@inject(TYPES.Config) config: Config) {
    this.spotify = new SpotifyWebApi({
      clientId: config.SPOTIFY_CLIENT_ID,
      clientSecret: config.SPOTIFY_CLIENT_SECRET,
    });

    this.soundcloud = new Soundcloud(config.SOUNDCLOUD_CLIENT_ID, config.SOUNDCLOUD_OAUTH_TOKEN);

    void this.refreshSpotifyToken();
  }

  cleanup() {
    if (this.spotifyTokenTimerId) {
      clearTimeout(this.spotifyTokenTimerId);
    }
  }

  private async refreshSpotifyToken() {
    await pRetry(async () => {
      const auth = await this.spotify.clientCredentialsGrant();
      this.spotify.setAccessToken(auth.body.access_token);
      this.spotifyTokenTimerId = setTimeout(this.refreshSpotifyToken.bind(this), (auth.body.expires_in / 2) * 1000);
    }, {retries: 5});
  }
}
