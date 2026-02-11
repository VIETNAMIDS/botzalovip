// Test lệnh lienquan sau khi sửa lỗi
const lienquanCommand = require('./plugins/commands/lienquan.js');

console.log('🧪 Test lệnh lienquan sau khi sửa lỗi...\n');

// Mock API giống zca-js
const mockApi = {
    sendMessage: (message, threadId, type) => {
        return new Promise((resolve, reject) => {
            // Kiểm tra message content
            if (!message || (typeof message === 'string' && message.trim().length === 0)) {
                reject(new Error('Missing message content'));
                return;
            }
            
            console.log('✅ Tin nhắn gửi thành công:');
            console.log('📝 Nội dung:', message);
            console.log('🆔 Thread ID:', threadId);
            console.log('📋 Type:', type);
            
            resolve({
                messageID: 'test_msg_' + Date.now(),
                threadID: threadId
            });
        });
    },
    
    setMessageReaction: (reaction, messageID, callback, something) => {
        console.log(`😍 Reaction: ${reaction} cho message ${messageID}`);
        if (callback) callback(null);
    }
};

// Mock event
const mockEvent = {
    threadId: 'test_thread_123',
    type: 'message',
    data: {
        uidFrom: '764450365581940909' // Admin ID
    }
};

// Test các trường hợp
async function runTests() {
    try {
        console.log('📋 Test 1: Lấy 1 tài khoản');
        await lienquanCommand.run({
            api: mockApi,
            event: mockEvent,
            args: []
        });
        
        console.log('\n📋 Test 2: Lấy 3 tài khoản');
        await lienquanCommand.run({
            api: mockApi,
            event: mockEvent,
            args: ['3']
        });
        
        console.log('\n📋 Test 3: Sai cú pháp');
        await lienquanCommand.run({
            api: mockApi,
            event: mockEvent,
            args: ['help']
        });
        
        console.log('\n✅ Tất cả test đều PASS! Lỗi đã được sửa.');
        
    } catch (error) {
        console.log('\n❌ Test FAILED:', error.message);
    }
}

runTests();
