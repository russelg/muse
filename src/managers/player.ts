import {inject, injectable} from 'inversify';
import {TYPES} from '../types.js';
import Player from '../services/player.js';
import InnertubeManager from '../managers/innertube.js';
import FileCacheProvider from '../services/file-cache.js';

@injectable()
export default class {
  private readonly guildPlayers: Map<string, Player>;
  private readonly fileCache: FileCacheProvider;
  private readonly innertube: InnertubeManager;

  constructor(@inject(TYPES.FileCache) fileCache: FileCacheProvider, @inject(TYPES.Managers.Innertube) innertube: InnertubeManager) {
    this.guildPlayers = new Map();
    this.fileCache = fileCache;
    this.innertube = innertube;
  }

  get(guildId: string): Player {
    let player = this.guildPlayers.get(guildId);

    if (!player) {
      player = new Player(this.fileCache, guildId, this.innertube);

      this.guildPlayers.set(guildId, player);
    }

    return player;
  }
}
