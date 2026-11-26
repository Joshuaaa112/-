import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

async function parsePrefixArgs(interaction) {
    if (!interaction.args || !interaction.args.length) return { targetArg: null, roleArg: null };

    const rawInput = interaction.args.join(' ');
    
    // Check if the command starts with a user mention: <@ID> or <@!ID>
    const userMentionMatch = rawInput.match(/^<@!?(\d+)>\s*(.+)$/);
    if (userMentionMatch) {
        return {
            targetArg: userMentionMatch[1],
            roleArg: userMentionMatch[2].trim(),
        };
    }

    // Fallback: split on spaces if no direct mention structure is matched
    const targetArg = interaction.args[0];
    const roleArg = interaction.args.slice(1).join(' ');
    return { targetArg, roleArg };
}

async function resolveTargetMember(interaction, targetArg) {
    let member = interaction.options.getMember('target');
    if (member) return member;

    const user = interaction.options.getUser('target');
    if (user) {
        return await interaction.guild.members.fetch(user.id).catch(() => null);
    }

    if (!targetArg) return null;

    const cleanId = targetArg.replace(/[<@!>]/g, '');
    member = await interaction.guild.members.fetch(cleanId).catch(() => null);
    if (member) return member;

    const members = await interaction.guild.members.fetch({ query: targetArg, limit: 1 }).catch(() => null);
    return members?.first() || null;
}

async function resolveRole(interaction, roleArg) {
    let role = interaction.options.getRole('role');
    if (role) return role;

    if (!roleArg) return null;

    // 1. Resolve by Role ID or clean role ping (<@&ID>)
    const cleanId = roleArg.replace(/[<@&>]/g, '').trim();
    role = interaction.guild.roles.cache.get(cleanId);
    if (role) return role;

    // 2. Exact name match (case-insensitive)
    const searchLower = roleArg.toLowerCase().trim();
    const rolesCache = interaction.guild.roles.cache;

    role = rolesCache.find((r) => r.name.toLowerCase() === searchLower);
    if (role) return role;

    // 3. Fallback: Partial name match
    return rolesCache.find((r) => r.name.toLowerCase().includes(searchLower)) || null;
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
        const { targetArg, roleArg } = await parsePrefixArgs(interaction);

        const member = await resolveTargetMember(interaction, targetArg);
        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'Could not find that user in this server.',
                { subtype: 'user_not_found' }
            );
        }

        const role = await resolveRole(interaction, roleArg);
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
