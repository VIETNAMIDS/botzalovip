const fs = require('fs');
const path = require('path');

console.log('🎮 Đang setup module Liên Quân...\n');

// Tạo thư mục
const dirs = [
    'modules/data',
    'modules/data/lienquan'
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Đã tạo thư mục: ${dir}`);
    } else {
        console.log(`📁 Thư mục đã có: ${dir}`);
    }
});

// Tạo file tài khoản mẫu
const accountsContent = `gamevn123|matkhau123
lienquan456|pass456
aov789|123456789
player001|password001
gamer999|mypass999
vn_player|vn123456
lq_master|master123
arena_king|king2024
mobile_gamer|mobile123
pro_player|propass
bonz_gaming|bonz2024
lienquan_pro|pro123456
aov_master|master2024
vietnam_gamer|vn2024
mobile_legend|legend123`;

const accountFile = 'modules/data/lienquan.txt';
if (!fs.existsSync(accountFile)) {
    fs.writeFileSync(accountFile, accountsContent, 'utf8');
    console.log(`✅ Đã tạo file tài khoản: ${accountFile}`);
} else {
    console.log(`📄 File tài khoản đã có: ${accountFile}`);
}

// Tạo file config
const configData = {
    "image_path": "modules/data/lienquan/lienquan.jpg",
    "version": "2.5.0",
    "last_updated": new Date().toISOString().split('T')[0],
    "total_accounts": 15,
    "admin_id": "764450365581940909",
    "admin_settings": {
        "max_accounts_per_request": 10,
        "cooldown_seconds": 3,
        "enable_reactions": true,
        "enable_images": true,
        "reaction_icons": ["🎮", "🔥", "⚡", "💥", "🏆", "🚀", "💫", "🕹️"]
    },
    "stats": {
        "total_requests": 0,
        "last_request": null,
        "most_requested_count": 1
    }
};

const configFile = 'modules/data/lienquan/lienquan_data.json';
if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 4), 'utf8');
    console.log(`✅ Đã tạo file config: ${configFile}`);
} else {
    console.log(`⚙️ File config đã có: ${configFile}`);
}

// Tạo file test
const testContent = `// Test module Liên Quân
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
        console.log(\`😍 Reaction: \${reaction}\`);
        if (callback) callback(null);
    }
};

const mockEvent = {
    senderID: "764450365581940909", // ID admin
    threadID: "test_thread_123",
    messageID: "test_msg_456"
};

console.log('🧪 Bắt đầu test module Liên Quân...\\n');

// Test lấy 1 tài khoản
console.log('📋 Test 1: Lấy 1 tài khoản');
lienquan.run({ api: mockApi, event: mockEvent, args: [] });

setTimeout(() => {
    console.log('\\n📋 Test 2: Lấy 3 tài khoản');
    lienquan.run({ api: mockApi, event: mockEvent, args: ['3'] });
}, 1000);

setTimeout(() => {
    console.log('\\n📋 Test 3: Hiển thị help');
    lienquan.run({ api: mockApi, event: mockEvent, args: ['help'] });
}, 2000);

console.log('\\n✅ Các test sẽ chạy trong 3 giây...');`;

const testFile = 'test_lienquan.js';
fs.writeFileSync(testFile, testContent, 'utf8');
console.log(`✅ Đã tạo file test: ${testFile}`);

// Tạo ảnh placeholder (base64 1x1 pixel)
const placeholderImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const imageFile = 'modules/data/lienquan/lienquan.jpg';
if (!fs.existsSync(imageFile)) {
    fs.writeFileSync(imageFile, placeholderImage);
    console.log(`✅ Đã tạo ảnh placeholder: ${imageFile}`);
} else {
    console.log(`🖼️ Ảnh đã có: ${imageFile}`);
}

console.log('\n🎉 Setup hoàn tất!');
console.log('\n📋 Hướng dẫn sử dụng:');
console.log('1. Chạy test: node test_lienquan.js');
console.log('2. Sử dụng lệnh: lienquan, lienquan 5, lienquan set, lienquan setimg');
console.log('3. Admin ID đã được set: 764450365581940909');
console.log('4. File tài khoản: modules/data/lienquan.txt (15 tài khoản mẫu)');
console.log('5. Đọc hướng dẫn chi tiết: modules/LIENQUAN_JS_README.md');
console.log('\n🚀 Module sẵn sàng sử dụng!');
