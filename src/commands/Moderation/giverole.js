import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

function parseRawArgs(interaction) {
    // Check if interaction was triggered via prefix command with raw message content
    const fullText = interaction.message?.content || interaction.content || '';
    
    // Remove prefix and command name (e.g., ",role " or ",giverole ")
    const cleanText = fullText.replace(/^,\w+\s+/, '').trim();

    if (!cleanText) {
        return {
            targetArg: interaction.args?.[0] || null,
            roleArg: interaction.args?.slice(1).join(' ').trim() || null,
        };
    }

    // Match user mention (<@123456789> or <@!123456789>) at the start
    const mentionMatch = cleanText.match(/^<@!?(\d+)>\s*(.+)$/);
    if (mentionMatch) {
        return {
            targetArg: mentionMatch[1],
            roleArg: mentionMatch[2].trim(),
        };
    }

    // Match user ID at the start
    const idMatch = cleanText.match(/^(\d{17,20})\s*(.+)$/);
    if (idMatch) {
        return {
            targetArg: idMatch[1],
            roleArg: idMatch[2].trim(),
        };
    }

    // Fallback: split on first space if no direct ID/mention matched
    const spaceIdx = cleanText.indexOf(' ');
    if (spaceIdx === -1) {
        return { targetArg: cleanText, roleArg: null };
    }

    return {
        targetArg: cleanText.substring(0, spaceIdx).trim(),
        roleArg: cleanText.substring(spaceIdx + 1).trim(),
    };
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

    const roles = await interaction.guild.roles.fetch().catch(() => null);
    if (!roles) return null;

    // 1. Resolve by ID or clean mention format (<@&ID>)
    const cleanId = roleArg.replace(/[<@&>]/g, '').trim();
    role = roles.get(cleanId);
    if (role) return role;

    // 2. Exact case-insensitive name match
    const searchLower = roleArg.toLowerCase().trim();
    role = roles.find((r) => r.name.toLowerCase() === searchLower);
    if (role) return role;

    // 3. Fallback: Partial name match
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
        const { targetArg, roleArg } = parseRawArgs(interaction);

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
