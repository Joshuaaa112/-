const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'roles',
  aliases: ['rolelist'],
  description: 'List all roles in the server or give a role to a member.',
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('List all roles in the server'),

  async runPrefix(message) {
    if (!message.guild) return;

    const roles = message.guild.roles.cache
      .filter((r) => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r} (\`${r.name}\`)`);

    if (!roles.length) {
      return message.reply('No custom roles found in this server.');
    }

    let output = `**Roles in ${message.guild.name} (${roles.length}):**\n`;
    for (const line of roles) {
      if ((output + line + '\n').length > 1950) {
        await message.channel.send(output);
        output = '';
      }
      output += `${line}\n`;
    }

    if (output.trim()) {
      await message.channel.send(output);
    }
  },
};
