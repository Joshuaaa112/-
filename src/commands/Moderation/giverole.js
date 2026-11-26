import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

export default {
    data: new SlashCommandBuilder()
        .setName('giverole')
        .setDescription('Add or remove a role on a server member')
        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription('The user to update roles for')
                .setRequired(true)
        )
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('The role to give or remove')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const role = interaction.options.getRole('role');

        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'The target user is not currently in this server.',
                { subtype: 'user_not_found' }
            );
        }

        if (!role || role.id === interaction.guild.id) {
            throw new TitanBotError(
                'Invalid Role',
                ErrorTypes.VALIDATION,
                'You cannot assign or remove the @everyone role.'
            );
        }

        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            throw new TitanBotError(
                'Role Hierarchy Error',
                ErrorTypes.VALIDATION,
                `I cannot manage **${role.name}** because it is equal to or higher than my highest role.`
            );
        }

        const alreadyHasRole = member.roles.cache.has(role.id);

        if (alreadyHasRole) {
            await member.roles.remove(role);
            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        'Role Removed',
                        `Removed **${role.name}** from ${targetUser.tag}.`
                    ),
                ],
                allowedMentions: NO_PINGS,
            });
        } else {
            await member.roles.add(role);
            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        'Role Added',
                        `Successfully gave **${role.name}** to ${targetUser.tag}.`
                    ),
                ],
                allowedMentions: NO_PINGS,
            });
        }
    },
};
