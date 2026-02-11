# 🎯 CỦA TỚ - Dịch vụ TikTok Integration

Tích hợp dịch vụ Zefoy để tăng tương tác TikTok (views, likes, followers, shares, favorites) với tên lệnh "bonz của tớ".

## 📋 Tính năng

### **Các dịch vụ hỗ trợ:**
- ✅ **Followers** - Tăng người theo dõi
- ✅ **Hearts/Likes** - Tăng tim/thích
- ✅ **Views** - Tăng lượt xem
- ✅ **Shares** - Tăng chia sẻ
- ✅ **Favorites** - Tăng yêu thích
- ✅ **Comments** - Tăng bình luận

### **Tính năng bảo mật:**
- 🔐 **Captcha verification** - Xác thực captcha tự động
- 👑 **Admin only** - Chỉ admin/owner được sử dụng
- ⏰ **Session timeout** - Hết hạn sau 5 phút
- 🧹 **Auto cleanup** - Tự động dọn dẹp file tạm

## ⚙️ Cài đặt Web Server

### **Bước 1: Khởi động Web Server**
Trước khi sử dụng, cần khởi động web server:

```bash
# Chạy từ thư mục bot
node start-zefoy-web.js
```

Hoặc:
```bash
# Chạy trực tiếp
node web/zefoy-server.js
```

### **Bước 2: Kiểm tra hoạt động**
- Web server sẽ chạy tại: `http://localhost:3000`
- Console sẽ hiển thị: `🌐 Zefoy Web Server running on http://localhost:3000`
- Giữ terminal mở trong khi sử dụng bot

## 🚀 Cách sử dụng

### **1. Khởi động hệ thống (Khuyến nghị)**
```
bonz của tớ start
```
→ Tự động khởi động web server + kiểm tra tất cả thành phần

**Output mẫu:**
```
🚀 Đang khởi động hệ thống Zefoy...
📡 Bước 1/4: Khởi động Web Server...
🔗 Bước 2/4: Kiểm tra kết nối Zefoy...
🖼️ Bước 3/4: Kiểm tra hệ thống captcha...
📊 Bước 4/4: Kiểm tra trạng thái dịch vụ...

✅ HỆ THỐNG ZEFOY ĐÃ SẴN SÀNG!

🌐 Web Server: http://localhost:3000 ✅
🔗 Kết nối Zefoy: Thành công ✅
🖼️ Hệ thống Captcha: OK (1234 bytes) ✅
📊 Dịch vụ khả dụng: 4/6 ✅

📋 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══

🟢 Followers (Người theo dõi): Hoạt động
🟢 Hearts/Likes (Tim/Thích): Hoạt động
🔴 Views (Lượt xem): Tạm ngưng
🟢 Shares (Chia sẻ): Hoạt động

🚀 SẴN SÀNG SỬ DỤNG:
• bonz của tớ hearts <url> - Tăng hearts/likes
• bonz của tớ views <url> - Tăng views
• bonz của tớ followers <url> - Tăng followers

💡 Hệ thống sẽ tự động mở web Zefoy khi bạn sử dụng dịch vụ!
```

### **2. Kiểm tra trạng thái dịch vụ**
```
bonz của tớ status
```
→ Hiển thị trạng thái tất cả dịch vụ Zefoy

### **3. Sử dụng dịch vụ**
```
/bonz của tớ hearts https://tiktok.com/@username/video/123456789
/bonz của tớ views https://vm.tiktok.com/ZMxxx/
/bonz của tớ followers https://tiktok.com/@username
```

### **4. Quy trình hoạt động**
1. **Gửi lệnh** → Bot kiểm tra trạng thái dịch vụ
2. **Nhận link web** → Bot gửi link để mở Zefoy
3. **Mở web** → Bấm link để mở trang Zefoy
4. **Giải captcha** → Giải captcha trực tiếp trên web Zefoy
5. **Báo cáo kết quả** → Bấm "Hoàn thành" trên web
6. **Kết quả + Trạng thái** → Bot tự động nhận và hiển thị trạng thái tất cả dịch vụ

## 📝 Các lệnh chi tiết

### **Lệnh chính:**
- `bonz của tớ` - Hiển thị hướng dẫn
- `bonz của tớ start` - Khởi động toàn bộ hệ thống
- `bonz của tớ status` - Kiểm tra trạng thái dịch vụ
- `bonz của tớ test` - Test kết nối và captcha

### **Các dịch vụ:**
- `bonz của tớ followers <url>` - Tăng followers
- `bonz của tớ hearts <url>` - Tăng hearts/likes  
- `bonz của tớ views <url>` - Tăng views
- `bonz của tớ shares <url>` - Tăng shares
- `bonz của tớ favorites <url>` - Tăng favorites
- `bonz của tớ comments <url>` - Tăng comments

## 🌐 Tính năng Web Interface

### **Giao diện web tích hợp:**
Bot sẽ tạo link web để bạn mở Zefoy trực tiếp:

```
🌐 MỞ WEB ZEFOY ĐỂ GIẢI CAPTCHA

🔗 Link: http://localhost:3000/zefoy/abc123_1234567890_xyz

📋 Hướng dẫn:
1️⃣ Bấm vào link phía trên
2️⃣ Trang web sẽ mở Zefoy tự động
3️⃣ Tìm dịch vụ HEARTS trên Zefoy
4️⃣ Nhập link TikTok và giải captcha
5️⃣ Bấm "Hoàn thành" khi xong

⏰ Thời gian: 10 phút
💡 Bot sẽ tự động nhận kết quả từ web
```

## 📊 Tính năng hiển thị trạng thái

### **Sau khi hoàn thành trên web:**
Bot sẽ tự động hiển thị trạng thái tất cả dịch vụ Zefoy:

```
✅ YÊU CẦU ZEFOY THÀNH CÔNG!

🎯 Dịch vụ đã sử dụng: Hearts/Likes (Tim/Thích)
🔗 Link: https://tiktok.com/@user/video/123
📝 Kết quả: Request submitted successfully

📊 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══

🟢 Followers (Người theo dõi): Hoạt động
🟢 Hearts/Likes (Tim/Thích): Hoạt động
🔴 Views (Lượt xem): Tạm ngưng
   └─ Service temporarily unavailable
🟢 Shares (Chia sẻ): Hoạt động
🔴 Favorites (Yêu thích): Tạm ngưng
🟢 Comments (Bình luận): Hoạt động

⏰ Thời gian xử lý: 1-5 phút
💡 Kiểm tra lại video sau ít phút để thấy kết quả
🔄 Sử dụng: bonz của tớ <service> <url> để tiếp tục
```

### **Ý nghĩa các biểu tượng:**
- 🟢 **Hoạt động**: Dịch vụ đang sẵn sàng sử dụng
- 🔴 **Tạm ngưng**: Dịch vụ hiện tại không khả dụng

## 🔗 Định dạng URL hỗ trợ

### **Video TikTok:**
- `https://tiktok.com/@username/video/1234567890123456789`
- `https://www.tiktok.com/@username/video/1234567890123456789`
- `https://vm.tiktok.com/ZMxxxxxxx/`

### **Profile TikTok (cho followers):**
- `https://tiktok.com/@username`
- `https://www.tiktok.com/@username`

## ⚠️ Lưu ý quan trọng

### **Giới hạn:**
- 🚫 **Chỉ admin/owner** - Không phải ai cũng dùng được
- ⏰ **Timeout 5 phút** - Phải giải captcha trong 5 phút
- 🔄 **Rate limiting** - Tránh spam để không bị ban IP
- 📱 **TikTok only** - Chỉ hỗ trợ link TikTok

### **Bảo mật:**
- 🔐 **Session riêng biệt** - Mỗi nhóm có session riêng
- 🧹 **Auto cleanup** - File captcha tự động xóa
- 👤 **User verification** - Chỉ người gửi lệnh mới giải được captcha

### **Xử lý lỗi:**
- ❌ **Captcha sai** → Thử lại với lệnh mới
- ❌ **Dịch vụ offline** → Kiểm tra `bonz zefoy status`
- ❌ **Link không hợp lệ** → Kiểm tra định dạng URL
- ❌ **Timeout** → Gửi lại lệnh từ đầu

## 🛠️ Technical Details

### **Files:**
- `zefoy.js` - Module chính xử lý Zefoy API
- `bonz.js` - Integration vào bot chính
- `temp/` - Thư mục lưu captcha tạm thời

### **Dependencies:**
- `axios` - HTTP requests
- `cheerio` - HTML parsing
- `fs` - File system operations

### **Global Variables:**
- `global.zefoyPendingRequests` - Lưu trữ yêu cầu đang chờ captcha

## 🔧 Troubleshooting

### **Lỗi thường gặp:**

**1. "Không thể lấy captcha"**
- Zefoy có thể đang bảo trì
- Kiểm tra kết nối internet
- Thử lại sau vài phút

**2. "Dịch vụ không khả dụng"**
- Dịch vụ tạm thời offline
- Sử dụng `bonz của tớ status` để kiểm tra
- Thử dịch vụ khác

**3. "Yêu cầu hết hạn"**
- Captcha không được giải trong 5 phút
- Gửi lại lệnh từ đầu

**4. "Captcha sai"**
- Nhìn kỹ lại ảnh captcha
- Phân biệt chữ hoa/thường
- Thử lại với lệnh mới

## 📊 Monitoring

### **Logs:**
- `[Zefoy]` - Prefix cho tất cả log Zefoy
- Session init, captcha fetch, request submit
- Error handling và cleanup

### **Performance:**
- Rate limiting giữa các request
- Automatic cleanup sau 5 phút
- Memory efficient với Buffer handling

---

**🎯 Của Tớ Integration v1.0**  
*Tích hợp bởi Bonz Bot - TikTok Services Made Easy*
