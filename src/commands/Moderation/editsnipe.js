import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SnipeStore } from '../../services/snipe/snipeStore.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

function buildEditedSnipeView(entries, index) {
    const total = entries.length;
    const safeIdx = Math.max(0, Math.min(index, total - 1));
    const entry = entries[safeIdx];
    const unixSec = Math.floor(entry.timestamp / 1000);

    const embed = successEmbed(
        `Edited Message — ${entry.authorTag}`,
        `**Before:**\n${entry.oldContent}\n\n**After:**\n${entry.newContent}\n\nEdited <t:${unixSec}:R>`
    );

    if (entry.authorAvatar) {
        embed.setThumbnail(entry.authorAvatar);
    }
    embed.setFooter({ text: `Edit Snipe ${safeIdx + 1} of ${total} • Expires after 24h` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('esnipe_prev')
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIdx === 0),
        new ButtonBuilder()
            .setCustomId('esnipe_next')
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIdx >= total - 1)
    );

    return { embed, row, safeIdx, total };
}

export default {
    data: new SlashCommandBuilder()
        .setName('es')
        .setDescription('View recently edited messages in this channel (last 24h)'),
    category: 'moderation',

    async execute(interaction) {
        const entries = SnipeStore.getEdited(interaction.channel.id);

        if (!entries.length) {
            return await InteractionHelper.universalReply(interaction, {
                content: 'There are no edited messages from the last 24 hours in this channel.',
                ephemeral: true,
                allowedMentions: NO_PINGS,
            });
        }

        let currentIdx = 0;
        const { embed, row, total } = buildEditedSnipeView(entries, currentIdx);

        const reply = await InteractionHelper.universalReply(interaction, {
            embeds: [embed],
            components: total > 1 ? [row] : [],
            allowedMentions: NO_PINGS,
        });

        if (total <= 1 || !reply?.createMessageComponentCollector) return;

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000,
        });

        collector.on('collect', async (btnInt) => {
            const requesterId = interaction.user?.id || interaction.author?.id;
            if (btnInt.user.id !== requesterId) {
                return btnInt.reply({
                    content: 'Only the person who ran the command can flip snipes.',
                    ephemeral: true,
                    allowedMentions: NO_PINGS,
                });
            }

            const freshEntries = SnipeStore.getEdited(interaction.channel.id);
            if (!freshEntries.length) {
                return btnInt.update({
                    content: 'All edit snipes in this channel expired.',
                    embeds: [],
                    components: [],
                    allowedMentions: NO_PINGS,
                });
            }

            if (btnInt.customId === 'esnipe_prev') currentIdx -= 1;
            if (btnInt.customId === 'esnipe_next') currentIdx += 1;

            const updated = buildEditedSnipeView(freshEntries, currentIdx);
            currentIdx = updated.safeIdx;

            await btnInt.update({
                embeds: [updated.embed],
                components: [updated.row],
                allowedMentions: NO_PINGS,
            });
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
            );
            await reply
                .edit({ components: [disabledRow], allowedMentions: NO_PINGS })
                .catch(() => {});
        });
    },
};
