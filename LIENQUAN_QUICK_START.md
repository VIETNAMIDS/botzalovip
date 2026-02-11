# 🎮 Liên Quân Module - Hướng Dẫn Nhanh

## ✅ ĐÃ SETUP XONG - SẴN SÀNG SỬ DỤNG!

### 👑 Admin ID: `764450365581940909` (bonz)

### 🎯 Lệnh Sử Dụng:
```
lienquan        → Lấy 1 tài khoản ngẫu nhiên
lienquan 3      → Lấy 3 tài khoản ngẫu nhiên
lienquan 10     → Lấy 10 tài khoản ngẫu nhiên
lienquan set    → Cập nhật danh sách (chỉ admin)
lienquan setimg → Đổi ảnh minh họa (chỉ admin)
```

### 📁 Files Đã Tạo:
- ✅ `modules/lienquan.js` - Module chính
- ✅ `modules/data/lienquan.txt` - 15 tài khoản mẫu
- ✅ `modules/data/lienquan/lienquan_data.json` - Config
- ✅ `modules/data/lienquan/lienquan.jpg` - Ảnh minh họa
- ✅ `test_lienquan.js` - File test
- ✅ `setup_lienquan.js` - Script setup

### 🚀 Tích Hợp Với Bot:

#### Cho Bot Facebook (FCA):
```javascript
// Trong thư mục commands/
// Copy file modules/lienquan.js vào commands/lienquan.js
```

#### Cho Bot Zalo:
```javascript
// Trong event handler
if (message.startsWith('lienquan')) {
    const lienquan = require('./modules/lienquan.js');
    const args = message.split(' ').slice(1);
    await lienquan.run({ api: client, event: messageObject, args });
}
```

### 🎨 Tính Năng Có Sẵn:
- 🎮 Phát tài khoản ngẫu nhiên
- 🖼️ Ảnh minh họa tự động
- 👑 Hệ thống admin
- 😍 6 reaction emoji ngẫu nhiên
- ⏰ Cooldown 3 giây
- 📊 Hiển thị thống kê
- 🔧 Xử lý lỗi tốt

### 📝 Thêm Tài Khoản Mới:
1. **Cách 1**: Sửa file `modules/data/lienquan.txt`
2. **Cách 2**: Dùng lệnh `lienquan set` (reply vào danh sách mới)

### 🖼️ Đổi Ảnh Minh Họa:
1. Upload ảnh lên chat
2. Reply ảnh đó với lệnh: `lienquan setimg`

### 🧪 Test Module:
```bash
node test_lienquan.js
```

### 📞 Hỗ Trợ:
- Module đã được test và hoạt động tốt
- Tương thích với các bot framework phổ biến
- Có xử lý lỗi và logging chi tiết

## 🎉 HOÀN TẤT - MODULE SẴN SÀNG!
