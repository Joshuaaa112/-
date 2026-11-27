import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const NO_PINGS = { parse: [], roles: [], users: [] };
const afkUsers = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your status to AFK')
        .addStringOption((option) =>
            option.setName('status').setDescription('AFK reason/status message').setRequired(false)
        ),
    category: 'utility',

    async execute(interaction) {
        const member = interaction.member;
        if (!member) return;

        const rawContent = interaction.message?.content || interaction.content || '';
        let status = interaction.options.getString('status');

        if (!status && rawContent.startsWith(',')) {
            const parts = rawContent.replace(/^,\w+\s*/, '').trim();
            if (parts) status = parts;
        }

        status = status || 'AFK';

        const originalNickname = member.nickname || member.user.username;
        const newNickname = `[AFK] ${originalNickname}`.slice(0, 32);

        afkUsers.set(member.id, {
            originalNickname,
            status,
            timestamp: Date.now(),
        });

        await member.setNickname(newNickname).catch(() => {});

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    'AFK Set',
                    `<@${member.id}> is now AFK: **${status}**`
                ),
            ],
            allowedMentions: NO_PINGS,
        });
    },
};

// Event listener hook to automatically clear AFK when the user speaks or reacts
export function handleAfkRemoval(client) {
    const clearAfk = async (user, channel) => {
        if (!user || user.bot || !afkUsers.has(user.id)) return;

        const data = afkUsers.get(user.id);
        afkUsers.delete(user.id);

        const guild = channel?.guild;
        if (guild) {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member) {
                const targetNick = data.originalNickname === member.user.username ? null : data.originalNickname;
                await member.setNickname(targetNick).catch(() => {});
            }
        }

        if (channel?.send) {
            await channel.send({
                embeds: [
                    successEmbed(
                        'Welcome Back!',
                        `<@${user.id}> is no longer AFK.`
                    ),
                ],
                allowedMentions: NO_PINGS,
            }).catch(() => {});
        }
    };

    client.on('messageCreate', (message) => {
        if (!message.author || message.author.bot) return;

        // Don't remove AFK if they are just running the ,afk command itself
        if (message.content.startsWith(',afk') || message.content.startsWith('/afk')) return;

        clearAfk(message.author, message.channel);
    });

    client.on('messageReactionAdd', (reaction, user) => {
        clearAfk(user, reaction.message.channel);
    });
}
