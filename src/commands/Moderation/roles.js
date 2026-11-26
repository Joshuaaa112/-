import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLES_PER_PAGE = 15;

function buildRolesPage(guild, roles, page) {
    const totalPages = Math.max(1, Math.ceil(roles.length / ROLES_PER_PAGE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * ROLES_PER_PAGE;
    const slice = roles.slice(start, start + ROLES_PER_PAGE);

    const lines = slice.map(
        (role, idx) => `\`${start + idx + 1}.\` ${role.name} (\`${role.id}\`)`
    );

    const embed = successEmbed(
        `Roles in ${guild.name} (${roles.length})`,
        lines.join('\n') || 'No roles on this page.'
    ).setFooter({ text: `Page ${safePage + 1} of ${totalPages}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('roles_prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage === 0),
        new ButtonBuilder()
            .setCustomId('roles_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return { embed, row, safePage, totalPages };
}

export default {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Display all roles in the server with pagination'),
    category: 'moderation',

    async execute(interaction) {
        const roles = interaction.guild.roles.cache
            .filter((role) => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position);

        if (!roles.size) {
            return await InteractionHelper.universalReply(interaction, {
                content: 'There are no custom roles in this server.',
                ephemeral: true,
                allowedMentions: { parse: [] },
            });
        }

        const roleList = [...roles.values()];
        let currentPage = 0;

        const { embed, row, totalPages } = buildRolesPage(
            interaction.guild,
            roleList,
            currentPage
        );

        const reply = await InteractionHelper.universalReply(interaction, {
            embeds: [embed],
            components: totalPages > 1 ? [row] : [],
            allowedMentions: { parse: [] },
        });

        if (totalPages <= 1 || !reply?.createMessageComponentCollector) return;

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000,
        });

        collector.on('collect', async (btnInt) => {
            if (btnInt.user.id !== interaction.user.id) {
                return btnInt.reply({
                    content: 'Only the person who ran the command can flip pages.',
                    ephemeral: true,
                    allowedMentions: { parse: [] },
                });
            }

            if (btnInt.customId === 'roles_prev') currentPage -= 1;
            if (btnInt.customId === 'roles_next') currentPage += 1;

            const updated = buildRolesPage(
                interaction.guild,
                roleList,
                currentPage
            );
            currentPage = updated.safePage;

            await btnInt.update({
                embeds: [updated.embed],
                components: [updated.row],
                allowedMentions: { parse: [] },
            });
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map((btn) =>
                    ButtonBuilder.from(btn).setDisabled(true)
                )
            );
            await reply
                .edit({ components: [disabledRow], allowedMentions: { parse: [] } })
                .catch(() => {});
        });
    },
};
