# 🎮 Module Liên Quân JavaScript - Hướng Dẫn Sử Dụng

## 📋 Mô Tả
Module JavaScript tự động phát tài khoản game Liên Quân Mobile cho bot Facebook/Zalo với giao diện đẹp mắt, hỗ trợ ảnh minh họa và quyền admin.

## 🚀 Cài Đặt

### 1. Tạo Thư Mục Dữ Liệu
```bash
mkdir modules\data
mkdir modules\data\lienquan
```

### 2. Copy File Dữ Liệu Mẫu
```bash
# Copy danh sách tài khoản mẫu
copy modules\lienquan_sample_accounts.txt modules\data\lienquan.txt

# Copy config mẫu  
copy modules\lienquan_sample_data.json modules\data\lienquan\lienquan_data.json
```

### 3. Cài Đặt Dependencies (Nếu Chưa Có)
```bash
npm install axios
```

### 4. Đặt Module Vào Bot
- Copy `lienquan.js` vào thư mục `modules/` hoặc `commands/` của bot
- Đảm bảo bot có thể load module từ thư mục này

## 🎯 Cách Sử Dụng

### Lệnh Cơ Bản
```
lienquan                    → Lấy 1 tài khoản ngẫu nhiên
lienquan 3                  → Lấy 3 tài khoản ngẫu nhiên
lienquan 10                 → Lấy 10 tài khoản ngẫu nhiên
```

### Lệnh Admin (Chỉ Admin)
```
lienquan set                → Reply vào tin nhắn chứa danh sách tài khoản mới
lienquan setimg             → Reply vào ảnh để đổi ảnh minh họa
```

## 👑 Cấu Hình Admin

### Thêm Admin Mới
Sửa file `modules/lienquan.js`, tìm dòng:
```javascript
const ADMIN = [
    "700542342650452398",  // ID admin chính
    "ID_ADMIN_MOI_CUA_BAN",  // Thêm ID admin mới
];
```

### Lấy ID Người Dùng Facebook
- Vào Facebook → Cài đặt → Thông tin cá nhân → Sao chép ID
- Hoặc dùng lệnh debug trong bot để lấy `event.senderID`

## 📁 Cấu Trúc File

```
modules/
├── lienquan.js                     # Module JavaScript chính
├── lienquan_sample_accounts.txt    # File tài khoản mẫu
├── lienquan_sample_data.json       # Config mẫu
└── data/                          # Thư mục dữ liệu thực
    ├── lienquan.txt               # Danh sách tài khoản thực
    └── lienquan/
        ├── lienquan.jpg           # Ảnh minh họa
        └── lienquan_data.json     # Config thực
```

## 📝 Format Tài Khoản

### Trong File `lienquan.txt`
```
username1|password1
username2|password2
gamevn123|matkhau123
lienquan456|pass456
```

### Mỗi Dòng = 1 Tài Khoản
- Format: `tên_đăng_nhập|mật_khẩu`
- Không có dòng trống
- Encoding: UTF-8

## 🔧 Tích Hợp Với Bot

### Cho Bot Facebook (FCA)
```javascript
// Trong file commands/lienquan.js
module.exports.run = async function({ api, event, args }) {
    // Code đã có sẵn trong module
};

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
```

### Cho Bot Zalo
```javascript
// Tích hợp với zlapi
const lienquan = require('./modules/lienquan.js');

// Trong event handler
if (message.startsWith('lienquan')) {
    const args = message.split(' ').slice(1);
    await lienquan.run({ api: client, event: messageObject, args });
}
```

## 🎨 Tính Năng

### ✅ Đã Có
- 🎮 Phát tài khoản ngẫu nhiên
- 🖼️ Gửi kèm ảnh minh họa
- 👑 Hệ thống admin
- ✨ Tin nhắn có format đẹp
- 😍 Reaction emoji tự động (6 emoji ngẫu nhiên)
- 📊 Hiển thị số lượng tài khoản
- ⏰ Cooldown 3 giây chống spam

### 🔄 Có Thể Thêm
- 📈 Thống kê sử dụng chi tiết
- 🏷️ Phân loại tài khoản (VIP, thường, ranked)
- 💾 Backup tự động hàng ngày
- 📝 Log hoạt động chi tiết
- 🔒 Mã hóa file tài khoản

## 🐛 Xử Lý Lỗi

### Lỗi Thường Gặp
1. **"File chưa có tài khoản"**
   - Tạo file `modules/data/lienquan.txt`
   - Copy từ file mẫu

2. **"Không có quyền"**
   - Kiểm tra ID trong danh sách ADMIN
   - Đảm bảo format ID đúng (string)

3. **"Lỗi tải ảnh"**
   - Kiểm tra URL ảnh hợp lệ
   - Đảm bảo kết nối internet ổn định

4. **"Module không load"**
   - Kiểm tra syntax JavaScript
   - Đảm bảo có đủ dependencies

### Debug
```javascript
// Thêm vào đầu hàm handleLienquanCommand
console.log(`DEBUG: senderID = ${event.senderID}`);
console.log(`DEBUG: isAdmin = ${isAdmin(event.senderID)}`);
console.log(`DEBUG: args = ${JSON.stringify(args)}`);
```

## 🚀 Khởi Chạy

### Test Module
```javascript
// test_lienquan.js
const lienquan = require('./modules/lienquan.js');

// Mock event object
const mockEvent = {
    senderID: "700542342650452398",
    threadID: "123456789",
    messageID: "mid.123"
};

const mockApi = {
    sendMessage: (msg, threadID, messageID) => {
        console.log("Sent:", msg);
    }
};

// Test lệnh
lienquan.run({ 
    api: mockApi, 
    event: mockEvent, 
    args: ["3"] 
});
```

## 📞 Hỗ Trợ

- **Tác giả**: Bé Bii
- **Version**: 2.5.0
- **Yêu cầu**: Node.js 12+, axios
- **Tương thích**: FCA, Zalo Bot, Mirai Bot

## 🔄 Cập Nhật

### Version 2.5.0
- ✅ Chuyển đổi từ Python sang JavaScript
- ✅ Tương thích với bot Facebook/Zalo
- ✅ Reaction emoji tự động
- ✅ Xử lý lỗi tốt hơn
- ✅ Cooldown chống spam

## 📄 License
Free to use - Tự do sử dụng và chỉnh sửa
