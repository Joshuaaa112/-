import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { reactionSnipeStore } from '../../services/snipe/reactionSnipeStore.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

function buildSnipePayload(entries, index, requesterId) {
  const entry = entries[index];
  const unixSeconds = Math.floor(entry.removedAt / 1000);

  const lines = [
    `**User:** <@${entry.userId}> (${entry.userTag})`,
    `**Reaction Removed:** ${entry.emojiDisplay}`,
    `**When:** <t:${unixSeconds}:R>`,
  ];

  if (entry.messageUrl) {
    lines.push(`**Message:** [Jump to Message](${entry.messageUrl})`);
  }

  if (entry.messageContent) {
    lines.push(`**Snippet:** ${entry.messageContent}`);
  }

  const embed = {
    title: 'Reaction Snipe',
    description: lines.join('\n'),
    color: 0x336699,
    footer: {
      text: `Snipe ${index + 1} of ${entries.length}`,
    },
    timestamp: new Date(entry.removedAt).toISOString(),
  };

  const components = [];
  if (entries.length > 1) {
    const prevBtn = new ButtonBuilder()
      .setCustomId(`rs_prev:${requesterId}:${index}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index <= 0);

    const nextBtn = new ButtonBuilder()
      .setCustomId(`rs_next:${requesterId}:${index}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= entries.length - 1);

    components.push(new ActionRowBuilder().addComponents(prevBtn, nextBtn));
  }

  return {
    embeds: [embed],
    components,
    allowedMentions: NO_PINGS,
  };
}

function getDisabledRows(entries, index, requesterId) {
  const payload = buildSnipePayload(entries, index, requesterId);
  return payload.components.map((row) => {
    row.components.forEach((btn) => btn.setDisabled(true));
    return row;
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('rs')
    .setDescription('View recently removed reactions in this channel'),
  category: 'utility',

  async execute(interaction) {
    const channelId = interaction.channelId || interaction.channel?.id;
    if (!channelId) {
      throw new TitanBotError(
        'Channel Error',
        ErrorTypes.USER_INPUT,
        'Could not determine this channel.'
      );
    }

    const entries = reactionSnipeStore.getChannelEntries(channelId);
    if (!entries.length) {
      throw new TitanBotError(
        'Nothing to Snipe',
        ErrorTypes.USER_INPUT,
        'There are no recently removed reactions in this channel.'
      );
    }

    const requesterId = interaction.user?.id || interaction.member?.id || 'unknown';
    const payload = buildSnipePayload(entries, 0, requesterId);
    const reply = await InteractionHelper.universalReply(interaction, payload);

    if (entries.length <= 1) return;

    const targetMessage = reply?.resource?.message || reply?.message || reply;
    let collector;

    if (typeof targetMessage?.createMessageComponentCollector === 'function') {
      collector = targetMessage.createMessageComponentCollector({
        time: 120_000,
      });
    } else if (typeof interaction.channel?.createMessageComponentCollector === 'function') {
      collector = interaction.channel.createMessageComponentCollector({
        filter: (btn) =>
          (btn.customId.startsWith('rs_prev:') || btn.customId.startsWith('rs_next:')) &&
          (!targetMessage?.id || btn.message?.id === targetMessage.id),
        time: 120_000,
      });
    }

    if (!collector) return;

    let currentIndex = 0;

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== requesterId) {
        await btnInteraction
          .reply({
            content: 'Only the person who ran `,rs` can use these buttons.',
            ephemeral: true,
          })
          .catch(() => {});
        return;
      }

      const freshEntries = reactionSnipeStore.getChannelEntries(channelId);
      if (!freshEntries.length) {
        await btnInteraction
          .update({
            content: 'All reaction snipes in this channel have expired.',
            embeds: [],
            components: [],
          })
          .catch(() => {});
        collector.stop();
        return;
      }

      if (btnInteraction.customId.startsWith('rs_prev:')) {
        currentIndex = Math.max(0, currentIndex - 1);
      } else if (btnInteraction.customId.startsWith('rs_next:')) {
        currentIndex = Math.min(freshEntries.length - 1, currentIndex + 1);
      }

      const updatedPayload = buildSnipePayload(freshEntries, currentIndex, requesterId);
      await btnInteraction.update(updatedPayload).catch(() => {});
    });

    collector.on('end', async () => {
      const freshEntries = reactionSnipeStore.getChannelEntries(channelId);
      if (!freshEntries.length) return;

      const safeIndex = Math.min(currentIndex, freshEntries.length - 1);
      const disabledComponents = getDisabledRows(freshEntries, safeIndex, requesterId);

      if (typeof targetMessage?.edit === 'function') {
        await targetMessage.edit({ components: disabledComponents }).catch(() => {});
      }
    });
  },
};
