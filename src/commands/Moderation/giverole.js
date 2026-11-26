const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'giverole',
  aliases: ['addrole'],
  description: 'Give a role to a server member.',
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a server member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Target member').setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Role to assign').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async runPrefix(message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('You need **Manage Roles** to use this command.');
    }

    const userArg = args[0];
    const roleQuery = args.slice(1).join(' ');
    if (!userArg || !roleQuery) {
      return message.reply('Usage: `,giverole @user @role`');
    }

    const userId = userArg.replace(/[<@!>]/g, '');
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return message.reply('Could not find that member.');
    }

    const roleId = roleQuery.replace(/[<@&>]/g, '');
    const role =
      message.guild.roles.cache.get(roleId) ||
      message.guild.roles.cache.find(
        (r) => r.name.toLowerCase() === roleQuery.toLowerCase()
      );

    if (!role || role.id === message.guild.id) {
      return message.reply('Could not find that role.');
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('I am missing the **Manage Roles** permission.');
    }

    if (role.position >= botMember.roles.highest.position) {
      return message.reply(
        `I cannot assign **${role.name}** because it is equal to or higher than my highest role.`
      );
    }

    await member.roles.add(role, `Assigned by ${message.author.tag} via ,giverole`);
    await message.reply(`Added **${role.name}** to ${member.user.tag}.`);
  },
};
