module.exports.config = {
  name: 'reloadconfig',
  version: '1.0.0',
  role: 2,
  author: 'ShinTHL09',
  description: 'Tải lại config',
  category: 'Hệ thống',
  usage: 'reloadconfig',
  cooldowns: 2,
  dependencies: {}
};

module.exports.run = async ({ event, api }) => {
  const { threadId, type } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }

  const { reloadConfig } = require("../../utils/index");

  await reloadConfig();

  return api.sendMessage("Tải lại config thành công", threadId, type);

};
