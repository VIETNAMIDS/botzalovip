// Test module Liên Quân
const lienquan = require('./modules/lienquan.js');

// Mock objects cho test
const mockApi = {
    sendMessage: (msg, threadID, messageID, callback) => {
        console.log('📤 Tin nhắn gửi:');
        if (typeof msg === 'object') {
            console.log('📝 Nội dung:', msg.body);
            if (msg.attachment) console.log('🖼️ Có ảnh đính kèm');
        } else {
            console.log('📝 Nội dung:', msg);
        }
        if (callback) callback(null, { messageID: 'test_msg_123' });
    },
    setMessageReaction: (reaction, messageID, callback) => {
        console.log(`😍 Reaction: ${reaction}`);
        if (callback) callback(null);
    }
};

const mockEvent = {
    senderID: "764450365581940909", // ID admin
    threadID: "test_thread_123",
    messageID: "test_msg_456"
};

console.log('🧪 Bắt đầu test module Liên Quân...\n');

// Test lấy 1 tài khoản
console.log('📋 Test 1: Lấy 1 tài khoản');
lienquan.run({ api: mockApi, event: mockEvent, args: [] });

setTimeout(() => {
    console.log('\n📋 Test 2: Lấy 3 tài khoản');
    lienquan.run({ api: mockApi, event: mockEvent, args: ['3'] });
}, 1000);

setTimeout(() => {
    console.log('\n📋 Test 3: Hiển thị help');
    lienquan.run({ api: mockApi, event: mockEvent, args: ['help'] });
}, 2000);

console.log('\n✅ Các test sẽ chạy trong 3 giây...');