import {ChatInputCommandInteraction} from 'discord.js';
import {TYPES} from '../types.js';
import {inject, injectable} from 'inversify';
import Command from './index.js';
import {SlashCommandBuilder} from '@discordjs/builders';
import FileCacheProvider from '../services/file-cache.js';
import AddQueryToQueue from '../services/add-query-to-queue.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('random')
    .setDescription('queue a random cached song')
    .addIntegerOption(option =>
      option.setName('range')
        .setDescription('number of songs to queue [default: 1]')
        .setRequired(false))
    .addBooleanOption(option => option
      .setName('immediate')
      .setDescription('add track to the front of the queue'))
  ;

  public requiresVC = true;

  constructor(
    @inject(TYPES.FileCache) private readonly fileCacheProvider: FileCacheProvider,
    @inject(TYPES.Services.AddQueryToQueue) private readonly addQueryToQueue: AddQueryToQueue,
  ) {
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const range = interaction.options.getInteger('range') ?? 1;
    const immediate = interaction.options.getBoolean('immediate') ?? false;

    if (range < 1 || range > 100) {
      throw new Error('range must be between 1 and 100');
    }

    try {
      // Get random cached files
      const randomFiles = await this.fileCacheProvider.getRandomFiles(range);

      if (randomFiles.length === 0) {
        await interaction.deferReply();
        await interaction.editReply('No cached songs found');
        return;
      }

      await this.addQueryToQueue.addToQueue({
        interaction,
        query: randomFiles.map(file => `cache::${file.hash}`).join(';'),
        addToFrontOfQueue: immediate,
        shuffleAdditions: false,
        shouldSplitChapters: false,
        skipCurrentTrack: false,
      });
    } catch (error) {
      await interaction.deferReply();
      await interaction.editReply(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
