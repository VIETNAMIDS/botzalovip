# 🤖 AI Learning System - Hướng Dẫn Sử Dụng

## 📋 Tổng Quan
Hệ thống AI Learning cho phép bot tự động học hỏi từ tin nhắn người dùng, phân tích cảm xúc, từ khóa và tạo ra những phản hồi thông minh dựa trên context đã học được.

## 📁 Cấu Trúc Files

### Core Files
- **`plugins/events/aiLearning.js`** - Engine AI learning chính
- **`plugins/commands/ailearn.js`** - Commands quản lý admin
- **`plugins/commands/bonz.js`** - Tích hợp với hệ thống BONZ

### Data Files (Tự động tạo)
- **`data/ai_learning.json`** - Dữ liệu học chính
- **`data/conversations.json`** - Lịch sử hội thoại

## 🚀 Cài Đặt & Khởi Động

### 1. Kiểm Tra Dependencies
```bash
# Đảm bảo có các module cần thiết
npm install fs path
```

### 2. Test Hệ Thống
```bash
# Chạy test script
node test_ai_learning.js
```

### 3. Khởi Động Bot
Hệ thống sẽ tự động hoạt động khi bot start. Không cần cấu hình thêm.

## 🎯 Cách Sử Dụng

### User Commands (Menu BONZ)
```bash
# Xem thống kê AI Learning
bonz learn stats
```

### Admin Commands
```bash
# Thống kê chi tiết hệ thống
ailearn stats

# Xem lịch sử hội thoại
ailearn history [threadID]

# Phân tích tin nhắn
ailearn analyze <văn bản>

# Test phản hồi AI
ailearn response <văn bản>

# Reset dữ liệu
ailearn reset [type]
# type: patterns, conversations, users, all

# Xuất/nhập dữ liệu
ailearn export
ailearn import

# Cấu hình hệ thống
ailearn config
```

## 🧠 Tính Năng AI Learning

### Auto Learning
- **Tự động học** từ mọi tin nhắn người dùng
- **Bỏ qua** commands và tin nhắn bot
- **Lưu trữ** patterns, keywords, emotions

### Emotion Analysis
Bot phân tích 6 loại cảm xúc:
- **Happy** 😄 - vui, haha, tuyệt vời
- **Sad** 😢 - buồn, khóc, tệ
- **Angry** 😠 - tức, giận, bực
- **Love** ❤️ - yêu, thương, thích
- **Surprised** 😮 - wow, bất ngờ, kinh ngạc
- **Fear** 😨 - sợ, lo, hoảng

### Smart Response
- **Tỷ lệ phản hồi**: 10% (không spam)
- **Confidence threshold**: >0.6
- **Response methods**:
  - Pattern matching
  - Emotion-based response
  - Keyword-based response

## 💾 Data Storage

### Learning Data Structure
```json
{
  "conversations": {},     // Lịch sử hội thoại
  "patterns": {},         // Mẫu tin nhắn học được
  "keywords": {},         // Từ khóa với context
  "userProfiles": {},     // Hồ sơ người dùng
  "responses": {},        // Phản hồi đã học
  "emotions": {},         // Phân tích cảm xúc
  "lastUpdate": timestamp
}
```

### User Profile Structure
```json
{
  "messageCount": 0,
  "commonWords": {},      // Từ thường dùng
  "emotions": {},         // Thống kê cảm xúc
  "lastSeen": timestamp,
  "personality": "neutral"
}
```

## ⚙️ Cấu Hình

### Response Rate (aiLearning.js line ~320)
```javascript
if (Math.random() < 0.1) { // 10% chance phản hồi
```

### Confidence Threshold (aiLearning.js line ~280)
```javascript
if (smartResponse && smartResponse.confidence > 0.6) {
```

### Message History Limit (aiLearning.js line ~172)
```javascript
if (threadHistory.length > 100) { // 100 tin/thread
```

### Auto-save Interval (aiLearning.js line ~350)
```javascript
setInterval(() => {
  saveLearningData();
}, 5 * 60 * 1000); // 5 phút
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "AI Learning module chưa được tải"
```bash
# Kiểm tra file tồn tại
ls plugins/events/aiLearning.js

# Kiểm tra syntax
node -c plugins/events/aiLearning.js
```

#### 2. "TypeError: profile.emotions is not iterable"
Đã được sửa trong phiên bản hiện tại. Nếu vẫn gặp lỗi:
```bash
# Reset dữ liệu
ailearn reset users
```

#### 3. "Missing threadId"
Đã được sửa trong phiên bản hiện tại. Đảm bảo event object có đủ thuộc tính.

### Debug Mode
Bật console logging để debug:
```javascript
// Trong aiLearning.js
console.log('[AI LEARNING DEBUG]', data);
```

## 📊 Monitoring

### Check Learning Progress
```bash
# Xem thống kê
ailearn stats

# Xem trong BONZ menu
bonz learn stats
```

### Data Files Location
```
data/
├── ai_learning.json     (Dữ liệu học chính)
└── conversations.json   (Lịch sử hội thoại)
```

### Log Messages
```
[AI LEARNING] Đã tải dữ liệu học thành công
[AI LEARNING] Đã lưu dữ liệu học
[AI LEARNING] Khởi tạo dữ liệu học mới
```

## 🚀 Production Tips

### Performance
- Hệ thống tự động cleanup old data
- Auto-save mỗi 5 phút
- Memory-efficient với Map structures

### Security
- Không lưu trữ thông tin nhạy cảm
- Local storage only
- No external API calls

### Scalability
- Dễ dàng thêm emotion types mới
- Expandable response algorithms
- Configurable thresholds

## 🎯 Future Enhancements

### Planned Features
- [ ] Sentiment analysis nâng cao
- [ ] Context-aware responses
- [ ] Multi-language support
- [ ] Advanced pattern recognition
- [ ] User personality profiling

### Integration Ideas
- [ ] Tích hợp với game system
- [ ] Social media sentiment tracking
- [ ] Advanced chatbot capabilities
- [ ] Machine learning models

## 📞 Support

Nếu gặp vấn đề:
1. Chạy `node test_ai_learning.js`
2. Kiểm tra console logs
3. Reset data nếu cần: `ailearn reset all`
4. Liên hệ developer

---

**🎉 Hệ thống AI Learning đã sẵn sàng hoạt động!**

Bot giờ đây có thể học hỏi từ người dùng và trở nên thông minh hơn theo thời gian.
