import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const NO_PINGS = { parse: [], roles: [], users: [] };

async function resolveTargetMember(interaction) {
    let member = interaction.options.getMember('target');
    if (member) return member;

    const user = interaction.options.getUser('target');
    if (user) {
        return await interaction.guild.members.fetch(user.id).catch(() => null);
    }

    const rawArg = interaction.options.getString('target') || interaction.args?.[0];
    if (!rawArg) return null;

    const cleanId = rawArg.replace(/[<@!>]/g, '');
    member = await interaction.guild.members.fetch(cleanId).catch(() => null);
    if (member) return member;

    const members = await interaction.guild.members.fetch({ query: rawArg, limit: 1 }).catch(() => null);
    return members?.first() || null;
}

async function resolveRole(interaction) {
    let role = interaction.options.getRole('role');
    if (role) return role;

    const rawArg = interaction.options.getString('role') || interaction.args?.slice(1).join(' ');
    if (!rawArg) return null;

    const cleanId = rawArg.replace(/[<@&>]/g, '');
    role = interaction.guild.roles.cache.get(cleanId);
    if (role) return role;

    const searchLower = rawArg.toLowerCase().trim();
    return interaction.guild.roles.cache.find(
        (r) => r.name.toLowerCase() === searchLower
    ) || interaction.guild.roles.cache.find(
        (r) => r.name.toLowerCase().includes(searchLower)
    ) || null;
}

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
        const member = await resolveTargetMember(interaction);
        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'Could not find that user in this server.',
                { subtype: 'user_not_found' }
            );
        }

        const role = await resolveRole(interaction);
        if (!role || role.id === interaction.guild.id) {
            throw new TitanBotError(
                'Invalid Role',
                ErrorTypes.VALIDATION,
                'Could not find that role, or you tried to select @everyone.'
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
                        `Removed **${role.name}** from ${member.user.tag}.`
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
                        `Successfully gave **${role.name}** to ${member.user.tag}.`
                    ),
                ],
                allowedMentions: NO_PINGS,
            });
        }
    },
};
