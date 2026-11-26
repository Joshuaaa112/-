import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("roles")
        .setDescription("Display all roles in the server"),
    category: "moderation",

    async execute(interaction, config, client) {
        const roles = interaction.guild.roles.cache
            .filter((role) => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => `${role} (\`${role.name}\`)`);

        if (!roles.length) {
            return await InteractionHelper.universalReply(interaction, {
                content: "There are no custom roles in this server.",
                ephemeral: true,
            });
        }

        const header = `**Roles in ${interaction.guild.name} (${roles.length}):**\n`;
        let output = header;

        for (const item of roles) {
            if ((output + item + '\n').length > 1950) {
                await interaction.channel.send(output);
                output = '';
            }
            output += `${item}\n`;
        }

        if (output.trim().length > 0) {
            await InteractionHelper.universalReply(interaction, {
                content: output,
            });
        }
    },
};
