// 🎮 Liên Quân Integration Helper
// Copy đoạn code này vào bot của bạn để tích hợp module Liên Quân

const lienquan = require('./modules/lienquan.js');

// ===== TÍCH HỢP CHO BOT FACEBOOK (FCA) =====
// Thêm vào event handler của bot FCA:
/*
case 'lienquan':
    return lienquan.run({ api, event, args });
*/

// ===== TÍCH HỢP CHO BOT ZALO =====
// Thêm vào message handler của bot Zalo:
/*
if (message.startsWith('lienquan')) {
    const args = message.split(' ').slice(1);
    return await lienquan.run({ 
        api: client, 
        event: {
            senderID: author_id,
            threadID: thread_id,
            messageID: message_object.msgId,
            messageReply: message_object.quote
        }, 
        args 
    });
}
*/

// ===== TÍCH HỢP CHO MIRAI BOT =====
// Thêm vào commands/lienquan.js:
/*
module.exports.config = {
    name: "lienquan",
    version: "2.5.0",
    hasPermssion: 0,
    credits: "Bé Bii",
    description: "Gửi tài khoản game Liên Quân",
    commandCategory: "Game",
    usages: "[số lượng] | set | setimg",
    cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
    const lienquan = require('../modules/lienquan.js');
    return lienquan.run({ api, event, args });
};
*/

// ===== CUSTOM INTEGRATION =====
// Cho các bot framework khác:
function integrateWithCustomBot(botApi, messageEvent, messageArgs) {
    // Chuyển đổi format event cho phù hợp
    const standardEvent = {
        senderID: messageEvent.userId || messageEvent.senderId,
        threadID: messageEvent.chatId || messageEvent.threadId,
        messageID: messageEvent.messageId || messageEvent.msgId,
        messageReply: messageEvent.reply || messageEvent.quote
    };
    
    // Chuyển đổi format API cho phù hợp
    const standardApi = {
        sendMessage: (msg, threadID, messageID, callback) => {
            // Implement theo API của bot framework bạn đang dùng
            botApi.sendMessage(msg, threadID, callback);
        },
        setMessageReaction: (reaction, messageID, callback) => {
            // Implement reaction nếu bot hỗ trợ
            if (botApi.addReaction) {
                botApi.addReaction(reaction, messageID, callback);
            }
        }
    };
    
    return lienquan.run({ 
        api: standardApi, 
        event: standardEvent, 
        args: messageArgs 
    });
}

// ===== EXPORT =====
module.exports = {
    lienquan,
    integrateWithCustomBot
};

// ===== USAGE EXAMPLES =====
/*
// Example 1: Direct usage
const { lienquan } = require('./lienquan_integration.js');
lienquan.run({ api: yourApi, event: yourEvent, args: ['3'] });

// Example 2: Custom bot integration
const { integrateWithCustomBot } = require('./lienquan_integration.js');
integrateWithCustomBot(yourBotApi, yourMessageEvent, ['5']);
*/
