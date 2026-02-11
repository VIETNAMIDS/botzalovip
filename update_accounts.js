const fs = require('fs');

console.log('🎮 Đang cập nhật danh sách tài khoản Liên Quân...\n');

// Đọc file tài khoản đầy đủ
const fullAccountsPath = './lienquan_accounts_full.txt';
const targetPath = './modules/data/lienquan.txt';

if (fs.existsSync(fullAccountsPath)) {
    try {
        // Đọc tài khoản mới
        const newAccounts = fs.readFileSync(fullAccountsPath, 'utf8');
        const accountLines = newAccounts.split('\n').filter(line => line.trim());
        
        console.log(`📋 Tìm thấy ${accountLines.length} tài khoản mới`);
        
        // Tạo thư mục nếu chưa có
        const targetDir = './modules/data';
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log('✅ Đã tạo thư mục:', targetDir);
        }
        
        // Ghi vào file đích
        fs.writeFileSync(targetPath, newAccounts, 'utf8');
        console.log('✅ Đã cập nhật file:', targetPath);
        
        // Cập nhật config
        const configPath = './modules/data/lienquan/lienquan_data.json';
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config.total_accounts = accountLines.length;
                config.last_updated = new Date().toISOString().split('T')[0];
                
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
                console.log('✅ Đã cập nhật config');
            } catch (e) {
                console.log('⚠️ Không thể cập nhật config:', e.message);
            }
        }
        
        console.log('\n🎉 Hoàn tất!');
        console.log(`📊 Tổng số tài khoản: ${accountLines.length}`);
        console.log('🎮 Bây giờ bạn có thể dùng lệnh lienquan với nhiều tài khoản hơn!');
        
        // Hiển thị một vài tài khoản mẫu
        console.log('\n📋 Một số tài khoản mẫu:');
        accountLines.slice(0, 5).forEach((account, index) => {
            console.log(`${index + 1}. ${account}`);
        });
        console.log('...');
        
    } catch (error) {
        console.log('❌ Lỗi:', error.message);
    }
} else {
    console.log('❌ Không tìm thấy file:', fullAccountsPath);
}
