import {injectable} from 'inversify';
import Innertube, {UniversalCache} from 'youtubei.js';

@injectable()
export default class {
  private innertube?: Innertube;

  async initialize() {
    this.innertube = await Innertube.create({
      cache: new UniversalCache(false),
    });

    return this.innertube;
  }

  async initializeTV() {
    this.innertube = await Innertube.create({
      cache: new UniversalCache(false),
    });

    // Fired when waiting for the user to authorize the sign in attempt.
    this.innertube.session.on('auth-pending', data => {
      console.log(`Go to ${data.verification_url} in your browser and enter code ${data.user_code} to authenticate.`);
    });

    // Fired when authentication is successful.
    this.innertube.session.on('auth', ({credentials}) => {
      console.log('Sign in successful:', credentials);
    });

    // Fired when the access token expires.
    this.innertube.session.on('update-credentials', async ({credentials}) => {
      console.log('Credentials updated:', credentials);
      await this.innertube?.session.oauth.cacheCredentials();
    });

    // Attempt to sign in
    await this.innertube.session.signIn();

    // ... do something after sign in

    // You may cache the session for later use
    // If you use this, the next call to signIn won't fire 'auth-pending' instead just 'auth'.
    await this.innertube.session.oauth.cacheCredentials();

    return this.innertube;
  }

  get(): Innertube {
    if (!this.innertube) {
      throw new Error('Innertube not initialized');
    }

    return this.innertube;
  }
}
