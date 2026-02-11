import os
import random
import json
import requests
import urllib.parse
from zlapi.models import Message, MultiMsgStyle, MessageStyle

des = {
    'version': "2.5.0",
    'credits': "Bé Bii",
    'description': "Gửi tài khoản game Liên Quân, có thể set danh sách và ảnh minh họa."
}

# ===== DANH SÁCH ADMIN =====
ADMIN = [
    "700542342650452398",  # ID admin chính
]

ACCOUNT_FILE = "modules/data/lienquan.txt"
IMAGE_FILE = "modules/data/lienquan/lienquan.jpg"
DATA_FILE = "modules/data/lienquan/lienquan_data.json"

# ===== Kiểm tra quyền =====
def is_admin(author_id):
    return str(author_id) in ADMIN

# ===== Tạo thư mục nếu chưa có =====
def ensure_dirs():
    os.makedirs(os.path.dirname(ACCOUNT_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(IMAGE_FILE), exist_ok=True)

# ===== Tải ảnh từ URL =====
def _download_image(url, save_path):
    try:
        response = requests.get(url, stream=True, timeout=10)
        response.raise_for_status()
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Lỗi tải ảnh: {e}")
        return False

# ===== Đọc file tài khoản =====
def read_accounts():
    if not os.path.exists(ACCOUNT_FILE):
        return []
    with open(ACCOUNT_FILE, "r", encoding="utf-8") as f:
        return [x.strip() for x in f.readlines() if x.strip()]

# ===== Ghi file tài khoản =====
def write_accounts(content):
    ensure_dirs()
    with open(ACCOUNT_FILE, "w", encoding="utf-8") as f:
        f.write(content.strip())

# ===== Gửi phản hồi style =====
def _reply_styled(client, text, message_object, thread_id, thread_type):
    styles = MultiMsgStyle([
        MessageStyle(offset=0, length=len(text), style="color", color="#FF5733", auto_format=False),
        MessageStyle(offset=0, length=len(text), style="bold", auto_format=False)
    ])
    client.replyMessage(Message(text=text, style=styles), message_object, thread_id=thread_id, thread_type=thread_type)

# ===== Đọc/lưu dữ liệu hình ảnh =====
def _load_data():
    ensure_dirs()
    default_data = {"image_path": IMAGE_FILE}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "image_path" not in data:
                    data["image_path"] = IMAGE_FILE
                return data
        except Exception:
            pass
    return default_data

def _save_data(data):
    ensure_dirs()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# ===== Lệnh chính =====
def handle_lienquan_command(message, message_object, thread_id, thread_type, author_id, client):
    args = message.strip().split(maxsplit=2)
    sub = args[1].lower() if len(args) > 1 else None
    accounts = read_accounts()
    data = _load_data()

    # --- Lệnh set danh sách ---
    if sub == "set":
        if not is_admin(author_id):
            _reply_styled(client, "🚫 Bạn không có quyền cập nhật danh sách tài khoản Liên Quân.", message_object, thread_id, thread_type)
            return
        if not message_object.quote or not message_object.quote.text:
            _reply_styled(client, "⚠️ Hãy reply vào tin nhắn chứa danh sách tài khoản mới để cập nhật.", message_object, thread_id, thread_type)
            return
        try:
            write_accounts(message_object.quote.text)
            _reply_styled(client, "✅ Đã cập nhật danh sách tài khoản Liên Quân thành công!", message_object, thread_id, thread_type)
        except Exception as e:
            _reply_styled(client, f"❌ Lỗi khi ghi file: {e}", message_object, thread_id, thread_type)
        return

    # --- Lệnh set ảnh ---
    if sub == "setimg":
        if not is_admin(author_id):
            _reply_styled(client, "🚫 Bạn không có quyền thay ảnh minh họa Liên Quân.", message_object, thread_id, thread_type)
            return
        if not message_object.quote or not message_object.quote.attach:
            _reply_styled(client, "⚠️ Hãy reply vào ảnh bạn muốn đặt làm ảnh minh họa.", message_object, thread_id, thread_type)
            return
        try:
            attach_data = json.loads(message_object.quote.attach)
            media_url = attach_data.get('hdUrl') or attach_data.get('href') or attach_data.get('oriUrl')
        except Exception:
            media_url = None

        if not media_url:
            _reply_styled(client, "❌ Không tìm thấy URL ảnh hợp lệ.", message_object, thread_id, thread_type)
            return

        media_url = urllib.parse.unquote(media_url.replace("\\/", "/"))
        if _download_image(media_url, IMAGE_FILE):
            data["image_path"] = IMAGE_FILE
            _save_data(data)
            _reply_styled(client, "✅ Ảnh minh họa Liên Quân đã được cập nhật thành công!", message_object, thread_id, thread_type)
        else:
            _reply_styled(client, "❌ Lỗi khi tải ảnh. Vui lòng thử lại.", message_object, thread_id, thread_type)
        return

    # --- Gửi tài khoản ngẫu nhiên + ảnh ---
    if sub is None or sub.isdigit():
        if not accounts:
            _reply_styled(client, "⚠️ File `modules/data/lienquan.txt` hiện chưa có tài khoản nào.", message_object, thread_id, thread_type)
            return

        try:
            count = int(sub) if sub and sub.isdigit() else 1
        except ValueError:
            count = 1

        count = min(count, len(accounts))
        selected = random.sample(accounts, count)
        msg = "🎮 𝐓𝐚̀𝐢 𝐊𝐡𝐨𝐚̉𝐧 𝐋𝐢𝐞̂𝐧 𝐐𝐮𝐚̂𝐧 𝐜𝐮̉𝐚 𝐛𝐚̣𝐧:\n───────────────────\n"
        msg += "\n".join(selected)
        msg += f"\n───────────────────\n📦 Tổng: {count}/{len(accounts)} tài khoản có sẵn."

        image_path = data.get("image_path", IMAGE_FILE)
        if os.path.exists(image_path):
            client.sendLocalImage(
                imagePath=image_path,
                message=Message(text=msg),
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=500000
            )
        else:
            client.sendMessage(Message(text=msg), thread_id, thread_type)

        # Gửi reaction ngẫu nhiên
        icons = ["🎮", "🔥", "⚡", "💥", "🏆", "🚀", "💫", "🕹️"]
        for icon in random.sample(icons, min(6, len(icons))):
            try:
                client.sendReaction(message_object, icon, thread_id, thread_type)
            except Exception:
                pass
        return

    # --- Sai cú pháp ---
    _reply_styled(client,
        "⚠️ Sai cú pháp.\n"
        "• lienquan → nhận 1 tài khoản ngẫu nhiên\n"
        "• lienquan <số lượng> → nhận nhiều tài khoản\n"
        "• lienquan set → reply danh sách để cập nhật file\n"
        "• lienquan setimg → reply ảnh để đổi ảnh minh họa",
        message_object, thread_id, thread_type
    )

# ===== Đăng ký lệnh =====
def get_mitaizl():
    return {
        'lienquan': handle_lienquan_command
    }
