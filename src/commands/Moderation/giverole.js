import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

async function resolveMemberAndRole(interaction) {
    let targetMember = interaction.options.getMember('target');
    let targetRole = interaction.options.getRole('role');

    // If both slash command options are present (Slash execution)
    if (targetMember && targetRole) {
        return { member: targetMember, role: targetRole };
    }

    // Determine raw string inputs from Prefix execution
    let rawUserStr = interaction.options.getString('target') || interaction.args?.[0];
    let rawRoleStr = interaction.options.getString('role') || interaction.args?.slice(1).join(' ');

    const rawContent = interaction.message?.content || interaction.content || '';
    if (rawContent && rawContent.startsWith(',')) {
        const cleanContent = rawContent.replace(/^,\w+\s+/, '').trim();
        const userMentionMatch = cleanContent.match(/^<@!?(\d+)>\s*(.+)$/);
        if (userMentionMatch) {
            rawUserStr = userMentionMatch[1];
            rawRoleStr = userMentionMatch[2];
        }
    }

    // Resolve Member
    if (!targetMember && rawUserStr) {
        const cleanUserId = String(rawUserStr).replace(/[<@!>]/g, '').trim();
        targetMember = await interaction.guild.members.fetch(cleanUserId).catch(() => null);

        if (!targetMember) {
            const members = await interaction.guild.members.fetch({ query: String(rawUserStr), limit: 1 }).catch(() => null);
            targetMember = members?.first() || null;
        }
    }

    // Resolve Role
    if (!targetRole && rawRoleStr) {
        const roles = await interaction.guild.roles.fetch().catch(() => null);
        if (roles) {
            const cleanRoleId = String(rawRoleStr).replace(/[<@&>]/g, '').trim();
            targetRole = roles.get(cleanRoleId);

            if (!targetRole) {
                const searchLower = String(rawRoleStr).toLowerCase().trim();
                targetRole = roles.find((r) => r.name.toLowerCase() === searchLower)
                    || roles.find((r) => r.name.toLowerCase().includes(searchLower))
                    || null;
            }
        }
    }

    return { member: targetMember, role: targetRole };
}

export default {
    data: new SlashCommandBuilder()
        .setName('role')
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
                .setDescription('The role to give or remove (ping or text name)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction) {
        const { member, role } = await resolveMemberAndRole(interaction);

        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'Could not find that user in this server.',
                { subtype: 'user_not_found' }
            );
        }

        if (!role || role.id === interaction.guild.id) {
            throw new TitanBotError(
                'Invalid Role',
                ErrorTypes.VALIDATION,
                'Could not find a role matching that name, or you tried to select @everyone.'
            );
        }

        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            throw new TitanBotError(
                'Role Hierarchy Error',
                ErrorTypes.VALIDATION,
                `I cannot manage <@&${role.id}> because it is equal to or higher than my highest role.`
            );
        }

        const alreadyHasRole = member.roles.cache.has(role.id);

        if (alreadyHasRole) {
            await member.roles.remove(role);
            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        'Role Removed',
                        `Removed <@&${role.id}> from <@${member.id}>.`
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
                        `Successfully gave <@&${role.id}> to <@${member.id}>.`
                    ),
                ],
                allowedMentions: NO_PINGS,
            });
        }
    },
};
