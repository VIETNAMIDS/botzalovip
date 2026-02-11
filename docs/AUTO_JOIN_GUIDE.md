# 🤖 Auto Join Zalo Group - Hướng Dẫn Sử Dụng

## 📋 Tổng Quan

Tính năng Auto Join Zalo Group cho phép bot tự động phát hiện và tham gia các nhóm Zalo khi có người dùng chia sẻ link trong chat. Đây là một tính năng mạnh mẽ giúp bot mở rộng phạm vi hoạt động một cách tự động.

## 🚀 Tính Năng Chính

### ✅ Phát Hiện Link Tự Động
- **Zalo Groups**: `zalo.me/g/[group_id]`
- **Zalo Invites**: `zalo.me/s/[invite_id]`
- **Messenger Groups**: `facebook.com/messages/t/[thread_id]` (chỉ thông báo)
- **Telegram Groups**: `t.me/[group_name]` (chỉ thông báo)
- **Discord Invites**: `discord.gg/[invite_code]` (chỉ thông báo)
- **WhatsApp Groups**: `chat.whatsapp.com/[invite_code]` (chỉ thông báo)

### 🛡️ Bảo Mật & Giới Hạn
- **Cooldown**: 5 phút giữa các lần join
- **Giới hạn hàng ngày**: 10 lần join/user/ngày
- **Whitelist/Blacklist**: Quản lý danh sách cho phép/chặn
- **Rate Limiting**: Tránh spam và bảo vệ tài khoản

### 📊 Thống Kê & Lịch Sử
- Lưu trữ lịch sử tham gia
- Thống kê thành công/thất bại
- Phân tích theo platform
- Báo cáo hàng ngày/tuần

## 🎮 Lệnh Sử Dụng

### Lệnh Cơ Bản

```bash
# Bật/tắt auto join
autojoin on          # Bật tính năng
autojoin off         # Tắt tính năng
autojoin             # Hiển thị help

# Xem trạng thái
autojoin status      # Trạng thái hiện tại
autojoin info        # Thông tin chi tiết
```

### Lệnh Quản Lý

```bash
# Lịch sử và thống kê
autojoin history     # 10 lần join gần nhất
autojoin history 20  # 20 lần join gần nhất
autojoin stats       # Thống kê tổng quan
autojoin log         # Xem log chi tiết

# Test và debug
autojoin test        # Test phát hiện link
```

### Tích Hợp Với Anti.js

```bash
# Sử dụng qua lệnh anti
anti autojoin        # Toggle auto join
anti                 # Xem menu (bao gồm autojoin)
```

## ⚙️ Cấu Hình

### File Cấu Hình: `config/autojoin_config.json`

```json
{
  "settings": {
    "maxDailyJoins": 10,
    "cooldownTime": 300000,
    "enabledPlatforms": ["ZALO_GROUP", "ZALO_INVITE"]
  },
  "limits": {
    "maxJoinsPerHour": 5,
    "maxJoinsPerDay": 10,
    "cooldownBetweenJoins": 300000
  }
}
```

### Tùy Chỉnh Thông Báo

```json
{
  "notifications": {
    "successMessage": "✅ Đã tham gia nhóm Zalo thành công!",
    "failureMessage": "❌ Không thể tham gia nhóm Zalo tự động",
    "cooldownMessage": "⏱️ Vui lòng chờ {time} trước khi tham gia nhóm tiếp theo"
  }
}
```

## 🔧 Cài Đặt & Thiết Lập

### 1. Kiểm Tra Dependencies

```bash
# Đảm bảo các module cần thiết đã được cài đặt
npm install axios zca-js
```

### 2. Cấu Hình Zalo API

Tạo file `config/zalo_session.json`:

```json
{
  "cookies": {
    "zpw_sek": "your_session_key",
    "zpw_uid": "your_user_id"
  },
  "secretKey": "your_secret_key",
  "imei": "your_imei"
}
```

### 3. Kích Hoạt Tính Năng

```bash
# Trong chat group
autojoin on
```

## 📱 Cách Hoạt Động

### 1. Phát Hiện Link
Khi có người dùng gửi tin nhắn chứa link Zalo group:

```
User: "Tham gia nhóm này nhé: https://zalo.me/g/abc123"
```

### 2. Xử Lý Tự Động
Bot sẽ:
1. Phát hiện link Zalo group
2. Kiểm tra cooldown và giới hạn
3. Thử tham gia nhóm
4. Gửi thông báo kết quả

### 3. Thông Báo Kết Quả

```
🤖 Auto Join Alert

🔗 Phát hiện link nhóm Zalo: https://zalo.me/g/abc123
✅ Đã tham gia nhóm thành công! (zca-js)

👤 Được chia sẻ bởi: @UserName
```

## 🛠️ API Methods

### Phương Thức Tham Gia

1. **zca-js API**: Sử dụng `api.joinGroup(groupId)`
2. **Custom Zalo API**: Sử dụng module `zaloapi.js`
3. **Manual Processing**: Log để xử lý thủ công

### Fallback System

```javascript
// Thứ tự ưu tiên
1. zca-js API (nếu có)
2. Custom Zalo API (nếu cấu hình)
3. Autojoin Module (dedicated handler)
4. Manual logging (fallback)
```

## 📊 Monitoring & Analytics

### Thống Kê Realtime

```bash
autojoin stats
```

Kết quả:
```
📊 Thống kê Auto Join

🔢 Tổng số lần join: 45
✅ Thành công: 38 (84%)
❌ Thất bại: 7 (16%)

🌐 Theo platform:
• ZALO_GROUP: 35/40 (88%)
• ZALO_INVITE: 3/5 (60%)
```

### File Log

- `temp/autojoin_data.json`: Lịch sử join
- `temp/autojoin_stats.json`: Thống kê tổng hợp

## 🚨 Xử Lý Lỗi

### Lỗi Thường Gặp

1. **"Session not configured"**
   - Kiểm tra file `config/zalo_session.json`
   - Đảm bảo cookies và secretKey hợp lệ

2. **"Rate limit exceeded"**
   - Chờ cooldown (5 phút)
   - Kiểm tra giới hạn hàng ngày

3. **"Group not found"**
   - Link không hợp lệ hoặc nhóm đã bị xóa
   - Kiểm tra quyền truy cập

### Debug Mode

```json
{
  "advanced": {
    "enableDebugMode": true
  }
}
```

## 🔒 Bảo Mật

### Best Practices

1. **Không chia sẻ session data**
2. **Sử dụng whitelist cho nhóm tin cậy**
3. **Giới hạn số lần join hàng ngày**
4. **Monitor hoạt động thường xuyên**

### Blacklist Management

```bash
# Thêm vào blacklist (cần implement)
autojoin blacklist add group_id
autojoin blacklist remove group_id
autojoin blacklist list
```

## 🧪 Testing

### Chạy Test Suite

```bash
node test_autojoin_advanced.js
```

### Test Cases

1. **Link Detection**: Phát hiện các loại link
2. **Auto Join Handling**: Xử lý tham gia nhóm
3. **Command Execution**: Test các lệnh
4. **Data Persistence**: Lưu trữ dữ liệu

## 📈 Performance

### Optimization Tips

1. **Cache session data**: Tránh login lại nhiều lần
2. **Batch processing**: Xử lý nhiều link cùng lúc
3. **Async operations**: Không block main thread
4. **Memory management**: Cleanup old data

### Monitoring

```javascript
// Memory usage
console.log(process.memoryUsage());

// Performance timing
console.time('autojoin-process');
// ... auto join logic
console.timeEnd('autojoin-process');
```

## 🤝 Contributing

### Thêm Platform Mới

1. Thêm pattern vào `AUTO_JOIN_PATTERNS`
2. Implement handler function
3. Update config file
4. Thêm test cases

### Code Style

```javascript
// Sử dụng async/await
async function handleAutoJoin() {
  try {
    const result = await joinGroup();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## 📞 Support

### Liên Hệ

- **GitHub Issues**: Báo cáo bug
- **Documentation**: Cập nhật hướng dẫn
- **Community**: Chia sẻ kinh nghiệm

### FAQ

**Q: Bot có thể tham gia nhóm riêng tư không?**
A: Chỉ có thể tham gia nhóm công khai hoặc có link mời hợp lệ.

**Q: Có giới hạn số lượng nhóm không?**
A: Có, mặc định 10 nhóm/ngày/user để tránh spam.

**Q: Làm sao để tắt thông báo?**
A: Chỉnh sửa `notifications` trong config file.

---

## 📝 Changelog

### v1.0.0 (2024-01-20)
- ✅ Phát hành phiên bản đầu tiên
- ✅ Hỗ trợ Zalo Groups và Invites
- ✅ Thống kê và lịch sử
- ✅ Tích hợp với anti.js
- ✅ Cấu hình linh hoạt

---

*Tài liệu này được cập nhật thường xuyên. Vui lòng kiểm tra phiên bản mới nhất.*
