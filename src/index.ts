import makeDir from 'make-dir';
import path from 'path';
import container from './inversify.config.js';
import {TYPES} from './types.js';
import Api from './api.js';
import Bot from './bot.js';
import Config from './services/config.js';
import InnertubeManager from './managers/innertube.js';
import FileCacheProvider from './services/file-cache.js';

const api = container.get<Api>(TYPES.Api);
const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  // Create data directories if necessary
  const config = container.get<Config>(TYPES.Config);

  await makeDir(config.DATA_DIR);
  await makeDir(config.CACHE_DIR);
  await makeDir(path.join(config.CACHE_DIR, 'tmp'));

  await container.get<FileCacheProvider>(TYPES.FileCache).cleanup();

  const innertube = container.get<InnertubeManager>(TYPES.Managers.Innertube);
  await innertube.initialize();

  await bot.register();

  api.start();
};

export {startBot};
