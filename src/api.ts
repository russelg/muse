import {inject, injectable} from 'inversify';
import {TYPES} from './types.js';
import PlayerManager from './managers/player.js';
import express from 'express';
import {prettyTime} from './utils/time.js';
import {MediaSource, QueuedSong, STATUS} from './services/player.js';
import getYouTubeID from 'get-youtube-id';
import Config from './services/config.js';
import AddQueryToQueue from './services/add-query-to-queue.js';
import debug from './utils/debug.js';

const transformSong = (song: QueuedSong, index?: number) => {
  const info = getSongTitleInfo(song);

  const data = {
    ...song,
    info,
    lengthText: song.isLive ? 'live' : prettyTime(song.length),
  };

  if (index !== undefined) {
    Object.assign(data, {index});
  }

  return data;
};

const getSongTitleInfo = ({title, url, offset, source}: QueuedSong) => {
  if (source === MediaSource.HLS) {
    return {title, url, youtubeId: null, source: 'HLS'};
  }

  const songTitle = title.replace(/\[.*\]/, '').trim();
  const youtubeId = url.length === 11 ? url : getYouTubeID(url) ?? '';

  return {
    title: songTitle,
    url: `https://www.youtube.com/watch?v=${youtubeId}${offset === 0 ? '' : '&t=' + String(offset)}`,
    youtubeId,
    source: 'Youtube',
  };
};

@injectable()
export default class {
  private readonly app = express();

  constructor(
    @inject(TYPES.Managers.Player) private readonly playerManager: PlayerManager,
    @inject(TYPES.Config) private readonly config: Config,
    @inject(TYPES.Services.AddQueryToQueue) private readonly addQueryToQueue: AddQueryToQueue,
  ) {
    this.app.get('/np/:guildId', async (req, res) => {
      try {
        const {guildId} = req.params;

        const player = this.playerManager.get(guildId);

        const fullQueue = player.getQueue();
        const history = player.getQueueHistory();
        const queueDuration = fullQueue.reduce((accumulator, current) => accumulator + current.length, 0);

        const queuePosition = player.getQueuePosition();
        const queue = fullQueue
          .map((song, i) => transformSong(song, i + 1));
        const queueHistory = history
          .map((song, i) => transformSong(song, i + 1))
          .reverse();

        const current = player.getCurrent();
        const nowPlaying = current ? transformSong(current) : null;
        const position = player.getPosition();

        const response = {
          success: true,
          np: nowPlaying ? {
            ...nowPlaying,
            index: queuePosition,
            position,
            elapsedTimeText: nowPlaying.isLive ? 'live' : `${prettyTime(position)}/${prettyTime(nowPlaying.length)}`,
          } : null,
          queue,
          history: queueHistory,
          looping: player.loopCurrentSong,
          status: player.status,
          statusText: player.status === STATUS.PLAYING ? 'Now Playing' : 'Paused',
          stats: {
            size: player.queueSize(),
            length: queueDuration,
            lengthText: prettyTime(queueDuration),
          },
        };

        res.send(response);
      } catch (e) {
        debug(e);
        res.send({success: false, error: e});
      }
    });

    this.app.get('/hello', async (req,res)=>{
      res.send('hello world!')
      console.log(req);
    });

    this.app.post('/play/:guildId/:password', express.json({type: '*/*'}), async (req, res) => {
      try {
        const {guildId, password} = req.params;

        if (this.config.WEBSERVER_PASSWORD !== password) {
          throw new Error('Unauthorized');
        }

        const body = req.body as Partial<{query: string; immediate: boolean; skipCurrentTrack: boolean; username: string}>;
        if (!body.query) {
          throw new Error('No query given');
        }

        const message = await this.addQueryToQueue.addToQueueInternal({
          guildId,
          query: body.query,
          addToFrontOfQueue: body.immediate ?? false,
          shuffleAdditions: false,
          shouldSplitChapters: false,
          skipCurrentTrack: body.skipCurrentTrack ?? false,
          username: body.username,
        });

        res.send({success: true, message});
      } catch (e: any) {
        debug(e);
        const error = e instanceof Error ? e.message : e as string;
        res.send({success: false, error});
      }
    });

    this.app.post('/skip/:guildId/:password', async (req, res) => {
      try {
        const {guildId, password} = req.params;

        if (this.config.WEBSERVER_PASSWORD !== password) {
          throw new Error('Unauthorized');
        }

        const player = this.playerManager.get(guildId);
        try {
          await player.forward(1);
        } catch (_: unknown) {
          throw new Error('no song to skip to');
        }

        res.send({success: true, message: 'keep \'er movin\''});
      } catch (e: any) {
        debug(e);
        const error = e instanceof Error ? e.message : e as string;
        res.send({success: false, error});
      }
    });

    this.app.post('/unskip/:guildId/:password', async (req, res) => {
      try {
        const {guildId, password} = req.params;

        if (this.config.WEBSERVER_PASSWORD !== password) {
          throw new Error('Unauthorized');
        }

        const player = this.playerManager.get(guildId);
        try {
          await player.back();
        } catch (_: unknown) {
          throw new Error('no song to go back to');
        }

        res.send({success: true, message: 'back \'er up\''});
      } catch (e: any) {
        debug(e);
        const error = e instanceof Error ? e.message : e as string;
        res.send({success: false, error});
      }
    });
  }

  public start() {
    this.app.listen(this.config.WEBSERVER_PORT, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${this.config.WEBSERVER_PORT}`);
    });
  }
}
