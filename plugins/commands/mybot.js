const { myBot } = require('../mybot/myBotManager');

module.exports.config = {
  name: 'mybot',
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Quản lý bot con (create/start/stop/list...)',
  category: 'System',
  usage: 'mybot <subcommand>',
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args, groupAdmins }) {
  return myBot(api, event, groupAdmins, args);
};
