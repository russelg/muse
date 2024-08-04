import {SlashCommandBuilder} from '@discordjs/builders';
import {inject, injectable} from 'inversify';
import Command from './index.js';
import {TYPES} from '../types.js';
import PlayerManager from '../managers/player.js';
import {ChatInputCommandInteraction} from 'discord.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('kill')
    .setDescription('kill the bot if its fucked');

  public requiresVC = false;

  private readonly playerManager: PlayerManager;

  constructor(@inject(TYPES.Managers.Player) playerManager: PlayerManager) {
    this.playerManager = playerManager;
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.playerManager.get(interaction.guild!.id);

    if (player.voiceConnection) {
      player.disconnect();
    }

    await interaction.reply('u betcha, restarting... gimme a second.');

    process.exit(1);
  }
}
