# 🎮 Module Liên Quân - Hướng Dẫn Sử Dụng

## 📋 Mô Tả
Module tự động phát tài khoản game Liên Quân Mobile với giao diện đẹp mắt, hỗ trợ ảnh minh họa và quyền admin.

## 🚀 Cài Đặt

### 1. Tạo Thư Mục Dữ Liệu
```bash
mkdir -p modules/data/lienquan
```

### 2. Copy File Dữ Liệu Mẫu
```bash
# Copy danh sách tài khoản mẫu
cp modules/lienquan_sample_accounts.txt modules/data/lienquan.txt

# Copy config mẫu
cp modules/lienquan_sample_data.json modules/data/lienquan/lienquan_data.json
```

### 3. Thêm Ảnh Minh Họa (Tùy Chọn)
- Đặt ảnh Liên Quân vào: `modules/data/lienquan/lienquan.jpg`
- Hoặc dùng lệnh `lienquan setimg` để upload ảnh mới

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
Sửa file `modules/lienquan.py`, tìm dòng:
```python
ADMIN = [
    "700542342650452398",  # ID admin chính
    "ID_ADMIN_MOI_CUA_BAN",  # Thêm ID admin mới
]
```

### Lấy ID Người Dùng
- Dùng lệnh debug trong bot để lấy `author_id`
- Hoặc check log khi có người dùng lệnh

## 📁 Cấu Trúc File

```
modules/
├── lienquan.py                     # Module chính
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

## 🎨 Tính Năng

### ✅ Đã Có
- 🎮 Phát tài khoản ngẫu nhiên
- 🖼️ Gửi kèm ảnh minh họa
- 👑 Hệ thống admin
- ✨ Tin nhắn có màu sắc
- 😍 Reaction emoji tự động
- 📊 Hiển thị số lượng tài khoản

### 🔄 Có Thể Thêm
- ⏰ Cooldown chống spam
- 📈 Thống kê sử dụng
- 🏷️ Phân loại tài khoản (VIP, thường)
- 💾 Backup tự động
- 📝 Log hoạt động

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

### Debug
```python
# Thêm vào đầu hàm handle_lienquan_command
print(f"DEBUG: author_id = {author_id}")
print(f"DEBUG: is_admin = {is_admin(author_id)}")
```

## 📞 Hỗ Trợ

- **Tác giả**: Bé Bii
- **Version**: 2.5.0
- **Yêu cầu**: Python 3.6+, zlapi, requests

## 📄 License
Free to use - Tự do sử dụng và chỉnh sửa
