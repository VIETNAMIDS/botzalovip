# 🧙‍♂️ HƯỚNG DẪN GAME TU TIÊN

> **Phiên bản:** 1.0 – tương ứng lệnh `tu` trong bot Zeid. Game cung cấp hơn 40 lệnh luyện khí, giao dịch, nuôi linh thú và khám phá. File lệnh nằm tại `plugins/commands/tutien.js`.

## 1. Chuẩn bị & Khởi động

| Bước | Mô tả |
|------|------|
|1|Khởi chạy bot như bình thường (`npm start`).|
|2|Trong khung chat, gõ `tu register <đạo hiệu>` để tạo nhân vật (ví dụ: `tu register Hạo Thiên`).|
|3|Gõ `tu help` để xem toàn bộ lệnh theo thứ tự được ưu tiên luyện tập.|

> Game tự lưu vào `data/tutien_players.json` mỗi 2 phút hoặc sau các thao tác quan trọng.

## 2. Flow đề xuất cho tân thủ

1. **Đăng ký & xem hồ sơ**: `tu register`, `tu profile`.
2. **Tĩnh tọa – vận công**: luân phiên `tu meditate`, `tu cultivate` để tích lũy khí & exp.
3. **Làm nhiệm vụ**: `tu mission`, `tu quest`, `tu explore` để kiếm linh thạch và vật phẩm.
4. **Đột phá cảnh giới**: khi đủ exp dùng `tu breakthrough`.
5. **Trang bị – nuôi thú**: `tu forge`, `tu equip`, `tu beast`, `tu feed`.
6. **Tham gia tông môn & giao lưu**: `tu joinsect <tên>`, `tu gift @tag 1000`, `tu leaderboard`.
7. **Nâng cao**: `tu dungeon`, `tu treasure`, `tu bless`, `tu insight`.

## 3. Nhóm lệnh chính (40+)

| Nhóm | Lệnh nổi bật |
|------|--------------|
|**Quản lý nhân vật**|`register`, `rename`, `profile`, `realms`, `story`
|**Tu luyện / Đột phá**|`meditate`, `cultivate`, `train`, `breakthrough`, `focus`, `insight`
|**Nhiệm vụ & khám phá**|`mission`, `quest`, `explore`, `gather`, `forage`, `dungeon`, `treasure`, `event`
|**Chế tác**|`alchemy`, `pill`, `refine`, `forge`
|**Trang bị & tài sản**|`equip`, `unequip`, `inventory`, `shop`, `buy`, `sell`, `trade`
|**Linh thú & đồng hành**|`beast`, `feed`, `companion`, `contract`
|**Di chuyển & tông môn**|`map`, `travel`, `sect`, `joinsect`, `leavesect`
|**Xã giao**|`gift`, `leaderboard`
|**Phòng thủ**|`protect`, `bless`

> Tất cả lệnh dùng cú pháp `tu <lệnh> [tham_số]`. Các alias phổ biến như `tu menu`, `tu start`, `tu stats`… đều đã ánh xạ.

## 4. Chiến lược luyện cấp

- **Quản lý khí**: luôn giữ >50 khí trước khi vào bí cảnh để tránh kiệt sức sau khi thất bại.
- **Dồn exp trước đột phá**: vì thất bại sẽ mất 20% exp, hãy dùng `tu bless` hoặc ăn đan (`tu pill major`) trước khi thử.
- **Đi map phù hợp**: `Tiên Linh Sơn` tăng tỉ lệ đột phá, `Vân Mộng Trạch` thích hợp farm dược liệu.
- **Không quên bảo hộ**: bật `tu protect` trước các hoạt động nguy hiểm để kích hoạt hộ thể quang.

## 5. Tips nâng trải nghiệm

1. **Macro vòng lặp**: sắp xếp chuỗi `meditate -> cultivate -> mission -> quest` để tối ưu thời gian hồi chiêu.
2. **Đẩy top sức mạnh**: ưu tiên rèn pháp khí (`tu forge`) mỗi khi sở hữu đủ tinh thiết + tinh thạch.
3. **Đầu tư linh thú**: sau khi có beast, duy trì `tu feed` để tăng lực chiến bền vững.
4. **Nhớ chia sẻ**: dùng `tu gift @tag 500` để hỗ trợ người chơi mới, giúp cộng đồng phát triển.

## 6. Đề xuất nâng cấp “siêu ngon – siêu đẹp”

### 6.1 Trải nghiệm thị giác & cảm xúc
- **Khung thông báo gradient**: thêm helper định dạng tin nhắn với icon + khung ASCII, ví dụ `formatMessage('🌌 Đột phá', body)`.
- **Ảnh minh họa**: khi thành công đột phá/thuần phục thú, gửi kèm ảnh trong `assets/tutien/`.
- **Hiệu ứng âm thanh nhẹ**: nếu dùng Zalo hỗ trợ file audio, phát đoạn nhạc khi boss xuất hiện (`api.sendAttachment`).

### 6.2 Gameplay
- **Hệ thống sự kiện thời gian thực**: lập lịch `node-schedule` để broadcast tin `tu event` toàn server.
- **Boss liên minh**: thêm lệnh `tu raid` yêu cầu nhiều người đóng góp khí hoặc vật phẩm, thưởng trang bị độc.
- **Cây kỹ năng**: lưu thêm `player.skills` (ví dụ: "Kiếm Ý", "Trận Pháp") giúp mở khóa combo mới.

### 6.3 UX & dữ liệu
- **Bảng dashboard**: ghi leaderboards vào file JSON rồi dựng trang trong `web/` để admin quan sát.
- **Telemetry nhẹ**: log tỉ lệ thất bại đột phá để cân bằng (`logger.info('[TuTien] Breakthrough fail rate ...')`).
- **Chế độ hướng dẫn tương tác**: lệnh `tu tutorial` gửi tuần tự 5 tin nhắn mô tả từng tính năng chính.

### 6.4 Hoạ tiết và câu chuyện
- **Story arcs**: định kỳ unlock câu chuyện mới dựa vào `player.stats.missions`.
- **NPC tương tác**: cho phép người chơi nhận thư (`tu mail`) từ trưởng lão với phần thưởng đặc biệt.

> Các đề xuất trên không phá vỡ cấu trúc hiện tại vì game đã có lưu trữ map, nhiệm vụ và linh thú. Chỉ cần bổ sung vài key trong đối tượng `player` và mở rộng switch-case lệnh.

## 7. Lịch bảo trì / tối ưu

| Hạng mục | Chu kỳ | Ghi chú |
|----------|--------|---------|
|Backup `tutien_players.json`|Hằng ngày|Sao chép sang `data/backups/`.
|Cân bằng giá vật phẩm|2 tuần|Điều chỉnh `SHOP_ITEMS` theo thống kê.
|Dọn cooldown lỗi|Khi cần|Nếu bị kẹt cooldown, dùng lệnh admin (tạm thời) hoặc xóa key trong file data.

Chúc bạn xây dựng một thế giới tu tiên rực rỡ – siêu ngon, siêu đẹp! Hãy thường xuyên cập nhật document này mỗi khi bổ sung cơ chế mới.
