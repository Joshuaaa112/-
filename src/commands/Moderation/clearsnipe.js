import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SnipeStore } from '../../services/snipe/snipeStore.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

export default {
    data: new SlashCommandBuilder()
        .setName('cs')
        .setDescription('Clear stored deleted and edited snipes in this channel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'moderation',

    async execute(interaction) {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) {
            return await InteractionHelper.universalReply(interaction, {
                content: 'You need the **Administrator** permission to use this command.',
                ephemeral: true,
                allowedMentions: NO_PINGS,
            });
        }

        const cleared = SnipeStore.clearChannel(interaction.channel.id);

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    'Snipes Cleared',
                    cleared
                        ? `Cleared snipes in <#${interaction.channel.id}>.`
                        : `There were no active snipes to clear in <#${interaction.channel.id}>.`
                ),
            ],
            allowedMentions: NO_PINGS,
        });
    },
};
