const { ThreadType } = require('zca-js');

module.exports.config = {
  name: 'bonzcau_do',
  aliases: ['bonzcau','bonzcdo','bonzcau_do'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Chơi câu đố BONZ (tách riêng từ lệnh bonz)',
  category: 'Giải trí',
  usage: 'bonz cau đố [tùy chọn]',
  cooldowns: 5
};

const bonzCore = require('./bonz');

module.exports.run = async (ctx) => {
  const { args } = ctx;
  return bonzCore.__handleCauDoCommand(ctx, args);
};

module.exports.handleEvent = async (ctx) => {
  if (typeof bonzCore.__handleCauDoEvent === 'function') {
    await bonzCore.__handleCauDoEvent(ctx);
  }
};
