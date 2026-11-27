import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

async function getArgs(interaction) {
    // 1. Slash command native options
    const targetMember = interaction.options.getMember('target');
    const targetUser = interaction.options.getUser('target');
    const slashRole = interaction.options.getRole('role');

    if (targetMember && slashRole) {
        return { member: targetMember, roleArg: slashRole.id };
    }

    // 2. Prefix command string options & raw args parsing
    const targetOpt = interaction.options.getString('target');
    const roleOpt = interaction.options.getString('role');

    let targetRaw = targetOpt || interaction.args?.[0];
    let roleRaw = roleOpt || interaction.args?.slice(1).join(' ');

    // 3. Fallback: Parse raw text from message if available
    const rawContent = interaction.message?.content || interaction.content || '';
    if (rawContent && rawContent.startsWith(',')) {
        const clean = rawContent.replace(/^,\w+\s+/, '').trim();
        const match = clean.match(/^<@!?(\d+)>\s*(.+)$/);
        if (match) {
            targetRaw = match[1];
            roleRaw = match[2];
        }
    }

    return { targetRaw, roleRaw, directMember: targetMember || targetUser };
}

async function resolveTargetMember(interaction, directMember, targetRaw) {
    if (directMember) {
        const member = await interaction.guild.members.fetch(directMember.id).catch(() => null);
        if (member) return member;
    }

    if (!targetRaw) return null;

    const cleanId = String(targetRaw).replace(/[<@!>]/g, '').trim();
    let member = await interaction.guild.members.fetch(cleanId).catch(() => null);
    if (member) return member;

    const members = await interaction.guild.members.fetch({ query: String(targetRaw), limit: 1 }).catch(() => null);
    return members?.first() || null;
}

async function resolveRole(interaction, roleRaw) {
    if (!roleRaw) return null;

    // Fetch full role list to bypass cache misses
    const roles = await interaction.guild.roles.fetch().catch(() => null);
    if (!roles) return null;

    const clean = String(roleRaw).replace(/[<@&>]/g, '').trim();
    
    // Check by ID / Mention ID
    let role = roles.get(clean);
    if (role) return role;

    // Check exact case-insensitive name
    const searchLower = clean.toLowerCase();
    role = roles.find((r) => r.name.toLowerCase() === searchLower);
    if (role) return role;

    // Check partial name match
    return roles.find((r) => r.name.toLowerCase().includes(searchLower)) || null;
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
        const { targetRaw, roleRaw, directMember } = await getArgs(interaction);

        const member = await resolveTargetMember(interaction, directMember, targetRaw);
        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'Could not find that user in this server.',
                { subtype: 'user_not_found' }
            );
        }

        const role = await resolveRole(interaction, roleRaw);
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
