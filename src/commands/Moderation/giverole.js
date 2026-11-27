import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

function extractRawInputs(interaction) {
    // Check if interaction was created from a message string (Prefix command)
    const rawContent = interaction.message?.content || interaction.content || '';
    
    if (rawContent && rawContent.startsWith(',')) {
        // Remove command prefix (e.g. ",role ")
        const cleanContent = rawContent.replace(/^,\w+\s+/, '').trim();
        
        // Match user mention <@ID> or <@!ID> followed by whatever text is left
        const userMentionMatch = cleanContent.match(/^<@!?(\d+)>\s*(.+)$/);
        if (userMentionMatch) {
            return {
                rawUser: userMentionMatch[1],
                rawRole: userMentionMatch[2].trim(),
            };
        }

        // Match user ID at start followed by text
        const userIdMatch = cleanContent.match(/^(\d{17,20})\s*(.+)$/);
        if (userIdMatch) {
            return {
                rawUser: userIdMatch[1],
                rawRole: userIdMatch[2].trim(),
            };
        }

        // Split on first space if no direct mention/ID syntax matched
        const spaceIdx = cleanContent.indexOf(' ');
        if (spaceIdx !== -1) {
            return {
                rawUser: cleanContent.substring(0, spaceIdx).trim(),
                rawRole: cleanContent.substring(spaceIdx + 1).trim(),
            };
        }

        return { rawUser: cleanContent, rawRole: '' };
    }

    // Slash command or string option fallbacks
    const rawUser = interaction.options.getString('target') || interaction.args?.[0] || '';
    const rawRole = interaction.options.getString('role') || interaction.args?.slice(1).join(' ') || '';

    return { rawUser, rawRole };
}

async function resolveMember(interaction, rawUser) {
    if (!rawUser) return null;

    const cleanId = String(rawUser).replace(/[<@!>]/g, '').trim();
    
    // 1. Try fetching directly by User ID / Clean Mention ID
    let member = await interaction.guild.members.fetch(cleanId).catch(() => null);
    if (member) return member;

    // 2. Try searching by username / nickname query
    const members = await interaction.guild.members.fetch({ query: String(rawUser), limit: 1 }).catch(() => null);
    return members?.first() || null;
}

async function resolveRole(interaction, rawRole) {
    if (!rawRole) return null;

    // Fetch all roles to guarantee no cache misses
    const roles = await interaction.guild.roles.fetch().catch(() => null);
    if (!roles) return null;

    const cleanId = String(rawRole).replace(/[<@&>]/g, '').trim();

    // 1. Check by Role ID / Clean Mention ID
    let role = roles.get(cleanId);
    if (role) return role;

    const searchLower = String(rawRole).toLowerCase().trim();

    // 2. Check exact case-insensitive role name
    role = roles.find((r) => r.name.toLowerCase() === searchLower);
    if (role) return role;

    // 3. Fallback: Check partial role name match
    return roles.find((r) => r.name.toLowerCase().includes(searchLower)) || null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role on a server member')
        .addStringOption((option) =>
            option
                .setName('target')
                .setDescription('The user to update roles for (mention, ID, or username)')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('role')
                .setDescription('The role to give or remove (ping, ID, or text name)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction) {
        const { rawUser, rawRole } = extractRawInputs(interaction);

        const member = await resolveMember(interaction, rawUser);
        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'Could not find that user in this server.',
                { subtype: 'user_not_found' }
            );
        }

        const role = await resolveRole(interaction, rawRole);
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
