import os
import time
import json
import threading
from datetime import datetime
from zlapi import ZaloAPI, ThreadType, Message
from zlapi.models import Mention, MultiMention, MessageStyle, MultiMsgStyle


UI_WIDTH = 70


class Colors:
    RESET = "\033[0m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"

# ===== Vẽ khung =====
def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def draw_box(title, content_lines, color=Colors.CYAN):
    print(color + "╔" + "═" * (UI_WIDTH - 2) + "╗" + Colors.RESET)
    print(color + "║" + Colors.RESET + title.center(UI_WIDTH - 2) + color + "║" + Colors.RESET)
    print(color + "╠" + "═" * (UI_WIDTH - 2) + "╣" + Colors.RESET)
    for line in content_lines:
        print(color + "║ " + Colors.RESET + line.ljust(UI_WIDTH - 4) + color + " ║" + Colors.RESET)
    print(color + "╚" + "═" * (UI_WIDTH - 2) + "╝" + Colors.RESET)


# =============================
# CHỨC NĂNG 1: Multi-Acc Spam (có TTL + style, không dashboard, có in lỗi chi tiết)
# =============================
class Bot(ZaloAPI):
    def __init__(self, imei, session_cookies, acc_index, delay, message_text, use_color=True, ttl=None):
        super().__init__("dummy_api_key", "dummy_secret_key", imei, session_cookies)
        self.acc_index = acc_index
        self.group_count = 0
        self.delay = delay
        self.stop_event = threading.Event()
        self.message_text = message_text
        self.use_color = use_color
        self.ttl = ttl

    def fetch_groups(self):
        groups_data = []
        try:
            all_groups = self.fetchAllGroups()
            for gid, _ in all_groups.gridVerMap.items():
                ginfo = super().fetchGroupInfo(gid)
                groups_data.append({
                    "id": gid,
                    "name": ginfo.gridInfoMap[gid]["name"]
                })
        except Exception as e:
            draw_box(f"[Acc {self.acc_index}] Lỗi lấy nhóm", [str(e)], Colors.RED)
        return groups_data

    def send_spam(self, group_id, group_name=None):
        mention = Mention("-1", length=len(self.message_text), offset=0)
        self.group_count += 1
        try:
            while not self.stop_event.is_set():
                try:
                    if self.use_color:
                        style = MultiMsgStyle([
                            MessageStyle(offset=0, length=len(self.message_text), style="color", color="#db342e", auto_format=False),
                            MessageStyle(offset=0, length=len(self.message_text), style="font", size="30", auto_format=False),
                        ])
                        if self.ttl:
                            self.send(Message(text=self.message_text, mention=mention, style=style),
                                      thread_id=group_id, thread_type=ThreadType.GROUP, ttl=self.ttl)
                        else:
                            self.send(Message(text=self.message_text, mention=mention, style=style),
                                      thread_id=group_id, thread_type=ThreadType.GROUP)
                    else:
                        if self.ttl:
                            self.send(Message(text=self.message_text, mention=mention),
                                      thread_id=group_id, thread_type=ThreadType.GROUP, ttl=self.ttl)
                        else:
                            self.send(Message(text=self.message_text, mention=mention),
                                      thread_id=group_id, thread_type=ThreadType.GROUP)

                    timestamp = datetime.now().strftime("%H:%M:%S")
                    group_display = group_name if group_name else group_id
                    print(f"{Colors.RED}[{timestamp}] Acc {self.acc_index} -> {group_display}: {self.message_text}{Colors.RESET}")

                except Exception as e:
                    print(f"❌ Lỗi gửi tin: {e}")

                time.sleep(self.delay)
        except KeyboardInterrupt:
            pass


def run_multi_acc():
    clear_screen()
    num_acc = int(input(" Nhập Số Lượng Acc (1-10): ").strip())
    bots = []

    for i in range(num_acc):
        clear_screen()
        draw_box(f"ACCOUNT {i+1} SETTINGS", [
            "📱 Nhập IMEI của Zalo:",
            "🍪 Nhập Cookie (JSON):",
            "📂 Nhập file spam (.txt):",
            "⏳ Nhập delay giữa các lần gửi (giây):",
            "⌛ TTL (giây, 0 = không dùng):"
        ], Colors.GREEN)

        imei = input("IMEI : ").strip()
        cookie_str = input("Cookie : ").strip()
        file_txt = input("File : ").strip()
        delay = int(input("Delay : ").strip() or "5")
        ttl_input = input("TTL : ").strip()
        ttl = int(ttl_input) if ttl_input.isdigit() and int(ttl_input) > 0 else None

        try:
            cookies = json.loads(cookie_str)
        except:
            draw_box("LỖI", ["❌ Cookie không hợp lệ, bỏ qua acc này."], Colors.RED)
            continue

        if not os.path.exists(file_txt):
            draw_box("LỖI", ["❌ File không tồn tại."], Colors.RED)
            continue
        with open(file_txt, "r", encoding="utf-8") as f:
            message_text = f.read().strip()

        bot = Bot(imei, cookies, i+1, delay, message_text, use_color=True, ttl=ttl)
        bots.append(bot)

        groups = bot.fetch_groups()
        if not groups:
            draw_box(f"[Acc {i+1}] KẾT QUẢ", ["❌ Không tìm thấy nhóm."], Colors.RED)
            continue

        lines = [f"{idx}. {g['name']} (ID: {g['id']})" for idx, g in enumerate(groups, 1)]
        draw_box(f"DANH SÁCH NHÓM ACC {i+1}", lines, Colors.CYAN)

        choice_str = input(" Chọn nhóm (vd: 1,2,3): ").strip()
        choices = [int(x) for x in choice_str.split(",") if x.strip().isdigit()]
        for choice in choices:
            if 1 <= choice <= len(groups):
                gid = groups[choice - 1]['id']
                gname = groups[choice - 1]['name']
                t = threading.Thread(target=bot.send_spam, args=(gid, gname))
                t.start()

    if not bots:
        draw_box("KẾT QUẢ", ["❌ Không có account nào hợp lệ."], Colors.RED)
        return

    draw_box("🚀 TOOL ĐÃ KHỞI CHẠY!", ["Multi-Acc Spam đang chạy..."], Colors.GREEN)
    input("Nhấn Enter để quay lại menu...")


# =============================
# CHỨC NĂNG 2: Spam + Tag @All (giữ nguyên gốc, không style, không TTL)
# =============================
class TagBot(ZaloAPI):
    def __init__(self, imei=None, session_cookies=None):
        super().__init__("dummy_api_key", "dummy_secret_key", imei, session_cookies)
        self.running = False

    def fetchGroupInfo(self):
        try:
            all_groups = self.fetchAllGroups()
            group_list = []
            for group_id, _ in all_groups.gridVerMap.items():
                group_info = super().fetchGroupInfo(group_id)
                group_name = group_info.gridInfoMap[group_id]["name"]
                group_list.append({'id': group_id, 'name': group_name})
            return group_list
        except Exception as e:
            print(f"❌ Lỗi khi lấy danh sách nhóm: {e}")
            return []

    def fetchGroupMembers(self, group_id):
        try:
            group_info = super().fetchGroupInfo(group_id)
            mem_ver_list = group_info.gridInfoMap[group_id]["memVerList"]
            member_ids = [mem.split("_")[0] for mem in mem_ver_list]
            members = []
            for user_id in member_ids:
                try:
                    user_info = self.fetchUserInfo(user_id)
                    user_data = user_info.changed_profiles[user_id]
                    members.append({'id': user_data['userId'], 'name': user_data['displayName']})
                except Exception:
                    members.append({'id': user_id, 'name': f"[Không lấy được tên {user_id}]"})
            return members
        except Exception as e:
            print(f"❌ Lỗi khi lấy danh sách thành viên: {e}")
            return []

    def send_message_multi(self, thread_id, message_text, users):
        try:
            mentions = []
            formatted_message = (message_text or "").rstrip() + " "
            for uid in users:
                user_info = self.fetchUserInfo(uid)
                user_name = user_info.changed_profiles[uid]['displayName']
                tag_text = f"@{user_name}"
                offset = len(formatted_message)
                formatted_message += tag_text + " "
                mentions.append(Mention(uid=uid, length=len(tag_text), offset=offset, auto_format=False))
            multi_mention = MultiMention(mentions) if mentions else None
            self.send(Message(text=formatted_message, mention=multi_mention),
                      thread_id=thread_id, thread_type=ThreadType.GROUP)
            print(f"✅ Đã gửi tin nhắn vào nhóm {thread_id}")
        except Exception as e:
            print(f"❌ Lỗi khi gửi: {e}")

    def send_message_all(self, thread_id, message_text):
        try:
            tag_text = "@All"
            formatted_message = (message_text or "").rstrip() + " " + tag_text
            offset = len(formatted_message) - len(tag_text)
            mention = Mention(uid="-1", length=len(tag_text), offset=offset, auto_format=False)
            multi_mention = MultiMention([mention])
            self.send(Message(text=formatted_message, mention=multi_mention),
                      thread_id=thread_id, thread_type=ThreadType.GROUP)
            print(f"✅ Đã gửi @All vào nhóm {thread_id}")
        except Exception as e:
            print(f"❌ Lỗi khi gửi @All: {e}")

    def send_file_content(self, thread_id, filename, delay, users):
        try:
            with open(filename, 'r', encoding='utf-8') as file:
                lines = [line.strip() for line in file.readlines() if line.strip()]
            if not lines:
                print("❌ File rỗng hoặc không có nội dung.")
                return
            self.running = True
            while self.running:
                for line in lines:
                    if not self.running:
                        break
                    if users == ["@all"]:
                        self.send_message_all(thread_id, line)
                    else:
                        self.send_message_multi(thread_id, line, users)
                    time.sleep(delay)
            print(f"✅ Hoàn thành gửi nội dung từ file {filename} vào nhóm {thread_id}")
        except FileNotFoundError:
            print(f"❌ Không tìm thấy file: {filename}")
        except Exception as e:
            print(f"❌ Lỗi khi đọc file hoặc gửi tin nhắn: {e}")

    def stop_sending(self):
        self.running = False
        print("🚦 Đã dừng gửi tin nhắn.")


def run_tag_spam():
    clear_screen()
    imei = input("IMEI : ").strip()
    cookie_str = input("Cookie : ").strip()
    try:
        cookies = json.loads(cookie_str)
    except:
        print("❌ Cookie không hợp lệ.")
        return

    client = TagBot(imei, cookies)
    groups = client.fetchGroupInfo()
    if not groups:
        return

    lines = [f"{i+1}. {g['name']} - ID: {g['id']}" for i, g in enumerate(groups)]
    draw_box("DANH SÁCH NHÓM", lines, Colors.CYAN)

    choice_str = input("\n Nhập số nhóm muốn chọn (vd: 1,2,3): ")
    choices = [int(x) for x in choice_str.split(",") if x.strip().isdigit()]
    selected_groups = [groups[c-1] for c in choices if 1 <= c <= len(groups)]

    if not selected_groups:
        print("⚠️ Không chọn nhóm nào.")
        return

    filename = input("📄 Nhập tên file chứa tin nhắn (ví dụ: tag.txt): ").strip()
    try:
        delay = float(input("⏳ Nhập delay (giây, đề xuất 5-10): ").strip())
    except ValueError:
        print("⚠️ Delay không hợp lệ, mặc định = 5")
        delay = 5

    for group in selected_groups:
        members = client.fetchGroupMembers(group['id'])
        lines = [f"{i+1}. {m['name']} (ID: {m['id']})" for i, m in enumerate(members)]
        draw_box(f"THÀNH VIÊN NHÓM {group['name']}", lines, Colors.YELLOW)

        choice = input("Nhập số thành viên để tag (cách nhau bằng dấu phẩy, 0 để bỏ qua, all để @All): ").strip()
        if choice.lower() == "0":
            users = []
        elif choice.lower() == "all":
            users = ["@all"]
        else:
            users = [members[int(x.strip()) - 1]['id'] for x in choice.split(",") if x.strip().isdigit()]

        send_thread = threading.Thread(target=client.send_file_content, args=(group['id'], filename, delay, users))
        send_thread.daemon = True
        send_thread.start()

    print(f"🚀 Bắt đầu spam từ file {filename} vào {len(selected_groups)} nhóm với delay {delay} giây...")
    input("Nhấn Enter để quay lại menu...")


def main_menu():
    while True:
        clear_screen()
        draw_box("ZALO TOOL MENU", [
            "1. 🚀 Multi-Acc Spam",
            "2. 🏷️ Spam + Tag (@All xanh)",
            "0. ❌ Thoát"
        ], Colors.CYAN)

        choice = input("👉 Chọn chức năng: ").strip()
        if choice == "1":
            run_multi_acc()
        elif choice == "2":
            run_tag_spam()
        elif choice == "0":
            break
        else:
            input("⚠️ Sai lựa chọn, nhấn Enter để thử lại...")


if __name__ == "__main__":
    main_menu()
