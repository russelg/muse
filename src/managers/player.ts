import {inject, injectable} from 'inversify';
import {TYPES} from '../types.js';
import Player from '../services/player.js';
import FileCacheProvider from '../services/file-cache.js';
import ThirdParty from '../services/third-party.js';

@injectable()
export default class {
  private readonly guildPlayers: Map<string, Player>;
  private readonly fileCache: FileCacheProvider;

  constructor(@inject(TYPES.FileCache) fileCache: FileCacheProvider, @inject(TYPES.ThirdParty) private readonly thirdparty: ThirdParty) {
    this.guildPlayers = new Map();
    this.fileCache = fileCache;
  }

  get(guildId: string): Player {
    let player = this.guildPlayers.get(guildId);

    if (!player) {
      player = new Player(this.thirdparty, this.fileCache, guildId);

      this.guildPlayers.set(guildId, player);
    }

    return player;
  }
}
