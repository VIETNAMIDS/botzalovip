module.exports = {
  config: {
    name: "testgame",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Test Game",
    description: "Test game command",
    commandCategory: "Game",
    usages: "testgame",
    cooldowns: 3
  },

  run: async function({ api, event, args }) {
    const { threadId, type } = event;
    return api.sendMessage("🎮 Test game command hoạt động!", threadId, type);
  }
};
