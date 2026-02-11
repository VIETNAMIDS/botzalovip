// Test xem lệnh lienquan có được load không
const fs = require('fs');
const path = require('path');

console.log('🧪 Kiểm tra lệnh lienquan...\n');

// Kiểm tra file lệnh có tồn tại không
const commandPath = './plugins/commands/lienquan.js';
if (fs.existsSync(commandPath)) {
    console.log('✅ File lệnh tồn tại:', commandPath);
    
    try {
        // Thử load module
        const lienquanCommand = require(commandPath);
        
        console.log('✅ Module load thành công');
        console.log('📋 Config lệnh:');
        console.log('  - Tên:', lienquanCommand.config.name);
        console.log('  - Aliases:', lienquanCommand.config.aliases);
        console.log('  - Mô tả:', lienquanCommand.config.description);
        console.log('  - Cooldown:', lienquanCommand.config.cooldowns, 'giây');
        
        // Kiểm tra dữ liệu
        const dataPath = './modules/data/lienquan.txt';
        if (fs.existsSync(dataPath)) {
            const accounts = fs.readFileSync(dataPath, 'utf8').split('\n').filter(line => line.trim());
            console.log('✅ File dữ liệu có', accounts.length, 'tài khoản');
        } else {
            console.log('⚠️ File dữ liệu chưa có, cần chạy setup');
        }
        
        console.log('\n🎮 Lệnh có thể sử dụng:');
        console.log('  - lienquan');
        console.log('  - lienquan 3');
        console.log('  - lq');
        console.log('  - aov');
        
        console.log('\n✅ Lệnh sẵn sàng! Hãy restart bot để load lệnh mới.');
        
    } catch (error) {
        console.log('❌ Lỗi khi load module:', error.message);
    }
} else {
    console.log('❌ File lệnh không tồn tại:', commandPath);
}

// Kiểm tra các file cần thiết
console.log('\n📁 Kiểm tra files:');
const requiredFiles = [
    './modules/data/lienquan.txt',
    './modules/data/lienquan/lienquan_data.json',
    './modules/data/lienquan/lienquan.jpg'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log('✅', file);
    } else {
        console.log('❌', file, '(chưa có)');
    }
});
