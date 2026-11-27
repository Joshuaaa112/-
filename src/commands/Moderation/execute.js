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

    const rawContent = interaction.message?.content || interaction.content || '';
    let targetArg = interaction.options.getString('target') || interaction.args?.[0];

    if (rawContent && rawContent.startsWith(',')) {
        const cleanContent = rawContent.replace(/^,\w+\s+/, '').trim();
        const match = cleanContent.match(/^<@!?(\d+)>/);
        if (match) targetArg = match[1];
    }

    if (!targetArg) return null;

    const cleanId = String(targetArg).replace(/[<@!>]/g, '').trim();
    member = await interaction.guild.members.fetch(cleanId).catch(() => null);
    if (member) return member;

    const members = await interaction.guild.members.fetch({ query: String(targetArg), limit: 1 }).catch(() => null);
    return members?.first() || null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('execute')
        .setDescription('Execute (ban) a user from the server')
        .addUserOption((option) =>
            option.setName('target').setDescription('The user to execute').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Reason for the execution').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
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

        if (!member.bannable) {
            throw new TitanBotError(
                'Hierarchy Error',
                ErrorTypes.VALIDATION,
                'I cannot execute this member (their role is equal to or higher than mine).'
            );
        }

        const rawContent = interaction.message?.content || interaction.content || '';
        let reason = interaction.options.getString('reason');

        if (!reason && rawContent.startsWith(',')) {
            const parts = rawContent.replace(/^,\w+\s+/, '').trim().split(/\s+/);
            if (parts.length > 1) {
                reason = parts.slice(1).join(' ');
            }
        }

        reason = reason || 'Executed by administrator command';

        await member.ban({ reason });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    'USER HAS BEEN KEYS.',
                    `<@${member.id}> has been executed and permanently banned from the server.\n\n**Reason:** ${reason}`
                ),
            ],
            allowedMentions: NO_PINGS,
        });
    },
};
