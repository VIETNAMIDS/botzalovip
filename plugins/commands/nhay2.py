import os
import time
import json
import threading
from datetime import datetime
from zlapi import ZaloAPI, ThreadType, Message
from zlapi.models import Mention, MessageStyle, MultiMsgStyle


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


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def draw_box(title, content_lines, color=Colors.CYAN):
    print(color + "╔" + "═" * (UI_WIDTH - 2) + "╗" + Colors.RESET)
    print(color + "║" + Colors.RESET + title.center(UI_WIDTH - 2) + color + "║" + Colors.RESET)
    print(color + "╠" + "═" * (UI_WIDTH - 2) + "╣" + Colors.RESET)
    for line in content_lines:
        print(color + "║ " + Colors.RESET + line.ljust(UI_WIDTH - 4) + color + " ║" + Colors.RESET)
    print(color + "╚" + "═" * (UI_WIDTH - 2) + "╝" + Colors.RESET)


class TreoBot(ZaloAPI):
    def __init__(self, imei, session_cookies, account_name="Account"):
        super().__init__("dummy_api_key", "dummy_secret_key", imei, session_cookies)
        self.account_name = account_name
        self.sessions = {}
        self.session_counter = 0
        self.groups_cache = []
        
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
            self.groups_cache = groups_data
        except Exception as e:
            draw_box("LỖI", [f"❌ Lỗi lấy nhóm: {str(e)}"], Colors.RED)
        return groups_data
    
    def load_messages_from_file(self, filepath):
        """Đọc tin nhắn từ file, hỗ trợ phân tách bằng ---"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            if '\n---\n' in content:
                messages = [msg.strip() for msg in content.split('\n---\n') if msg.strip()]
            elif '\n----\n' in content:
                messages = [msg.strip() for msg in content.split('\n----\n') if msg.strip()]
            else:
                messages = [content]
            
            return messages
        except Exception as e:
            print(f"{Colors.RED}❌ Lỗi đọc file: {e}{Colors.RESET}")
            return []
    
    def split_long_message(self, text, max_length=3500):
        """Chia tin nhắn dài thành nhiều phần (giới hạn 3500 ký tự để an toàn)"""
        if len(text) <= max_length:
            return [text]
        
        parts = []
        current_pos = 0
        
        while current_pos < len(text):
            # Lấy đoạn text
            end_pos = current_pos + max_length
            
            if end_pos < len(text):
                # Tìm vị trí xuống dòng gần nhất để chia tự nhiên
                last_newline = text.rfind('\n', current_pos, end_pos)
                if last_newline > current_pos + 100:  # Chỉ chia ở newline nếu không quá gần đầu
                    end_pos = last_newline + 1
                else:
                    # Tìm khoảng trắng gần nhất
                    last_space = text.rfind(' ', current_pos, end_pos)
                    if last_space > current_pos + 100:
                        end_pos = last_space + 1
            
            part = text[current_pos:end_pos].strip()
            if part:
                parts.append(part)
            current_pos = end_pos
        
        return parts
    
    def build_multi_color_style(self, text):
        """Tạo style đa màu ngẫu nhiên cho text (giới hạn 50 segments)"""
        if not text:
            return []
        
        colors = [
            "#FF0000", "#FF4500", "#FF8C00", "#FFD700", "#FFFF00",
            "#00FF00", "#00FA9A", "#00CED1", "#1E90FF", "#0000FF",
            "#8A2BE2", "#9400D3", "#FF1493", "#FF69B4", "#DC143C",
            "#FF6347", "#32CD32", "#00BFFF", "#BA55D3", "#FFA500"
        ]
        
        styles = []
        text_length = len(text)
        max_segments = 45  # Giảm xuống 45 để an toàn hơn
        
        cursor = 0
        import random
        
        while cursor < text_length and len(styles) < max_segments:
            remaining = text_length - cursor
            
            if len(styles) >= max_segments - 1:
                chunk = remaining
            else:
                # Tăng kích thước chunk để giảm số lượng segments
                chunk = min(remaining, random.randint(5, 20))
            
            color = random.choice(colors)
            styles.append(MessageStyle(
                offset=cursor,
                length=chunk,
                style="color",
                color=color,
                auto_format=False
            ))
            cursor += chunk
        
        return styles
    
    def send_treo_loop(self, group_id, group_name, messages, delay, ttl, session_id, file_name):
        """Vòng lặp gửi tin nhắn treo - TỰ ĐỘNG CHIA NHỎ TIN NHẮN DÀI"""
        if group_id not in self.sessions:
            return
        if session_id not in self.sessions[group_id]:
            return
            
        session = self.sessions[group_id][session_id]
        index = 0
        
        while session['running']:
            try:
                msg_text = messages[index % len(messages)]
                
                # CHIA NHỎ TIN NHẮN NẾU QUÁ DÀI
                msg_parts = self.split_long_message(msg_text)
                
                # Gửi từng phần
                for part_idx, part in enumerate(msg_parts):
                    if not session['running']:
                        break
                    
                    mention = Mention("-1", length=len(part), offset=0)
                    color_styles = self.build_multi_color_style(part)
                    
                    font_style = MessageStyle(
                        offset=0,
                        length=len(part),
                        style="font",
                        size="16",
                        auto_format=False
                    )
                    
                    all_styles = color_styles + [font_style]
                    multi_style = MultiMsgStyle(all_styles)
                    
                    # Gửi tin nhắn
                    if ttl and ttl > 0:
                        self.send(
                            Message(text=part, mention=mention, style=multi_style),
                            thread_id=group_id,
                            thread_type=ThreadType.GROUP,
                            ttl=ttl
                        )
                    else:
                        self.send(
                            Message(text=part, mention=mention, style=multi_style),
                            thread_id=group_id,
                            thread_type=ThreadType.GROUP
                        )
                    
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    preview = part[:30].replace('\n', ' ')
                    part_info = f" [{part_idx+1}/{len(msg_parts)}]" if len(msg_parts) > 1 else ""
                    print(f"{Colors.GREEN}[{timestamp}] [{self.account_name}] ✅ {group_name} [{file_name}]{part_info}: {preview}...{Colors.RESET}")
                    
                    # Nếu có nhiều phần, delay ngắn giữa các phần (0.5s)
                    if part_idx < len(msg_parts) - 1:
                        time.sleep(0.5)
                
                session['index'] = index
                index += 1
                
            except Exception as e:
                timestamp = datetime.now().strftime("%H:%M:%S")
                print(f"{Colors.RED}[{timestamp}] ❌ [{self.account_name}] [{file_name}] Lỗi: {e}{Colors.RESET}")
            
            time.sleep(delay)
    
    def start_treo_session(self, group_id, group_name, messages, delay, ttl, file_name):
        """Bắt đầu một session treo mới cho nhóm"""
        self.session_counter += 1
        session_id = f"session_{self.session_counter}"
        
        if group_id not in self.sessions:
            self.sessions[group_id] = {}
        
        self.sessions[group_id][session_id] = {
            'running': True,
            'index': 0,
            'thread': None,
            'file_name': file_name,
            'delay': delay,
            'ttl': ttl,
            'group_name': group_name
        }
        
        thread = threading.Thread(
            target=self.send_treo_loop,
            args=(group_id, group_name, messages, delay, ttl, session_id, file_name)
        )
        thread.daemon = True
        thread.start()
        
        self.sessions[group_id][session_id]['thread'] = thread
        return session_id
    
    def stop_session(self, group_id, session_id):
        """Dừng một session cụ thể"""
        if group_id in self.sessions and session_id in self.sessions[group_id]:
            self.sessions[group_id][session_id]['running'] = False
            del self.sessions[group_id][session_id]
            
            if not self.sessions[group_id]:
                del self.sessions[group_id]
            return True
        return False
    
    def stop_all_sessions_in_group(self, group_id):
        """Dừng tất cả session trong một nhóm"""
        if group_id in self.sessions:
            for session_id in list(self.sessions[group_id].keys()):
                self.sessions[group_id][session_id]['running'] = False
            del self.sessions[group_id]
            return True
        return False
    
    def stop_all_treo(self):
        """Dừng tất cả treo"""
        for group_id in list(self.sessions.keys()):
            for session_id in list(self.sessions[group_id].keys()):
                self.sessions[group_id][session_id]['running'] = False
        self.sessions.clear()
    
    def get_status(self):
        """Lấy trạng thái các nhóm đang treo"""
        status = []
        for group_id, sessions in self.sessions.items():
            for session_id, session in sessions.items():
                status.append({
                    'group_id': group_id,
                    'session_id': session_id,
                    'file_name': session['file_name'],
                    'index': session['index'],
                    'running': session['running'],
                    'delay': session['delay'],
                    'ttl': session['ttl'],
                    'group_name': session.get('group_name', 'Unknown'),
                    'account_name': self.account_name
                })
        return status
    
    def count_sessions_in_group(self, group_id):
        """Đếm số session đang chạy trong nhóm"""
        if group_id in self.sessions:
            return len(self.sessions[group_id])
        return 0


class MultiAccountManager:
    """Quản lý nhiều tài khoản bot"""
    def __init__(self):
        self.bots = {}  # account_id -> TreoBot
        self.account_counter = 0
    
    def add_account(self, imei, cookies, account_name=None):
        """Thêm tài khoản mới"""
        self.account_counter += 1
        if not account_name:
            account_name = f"Acc{self.account_counter}"
        
        account_id = f"acc_{self.account_counter}"
        
        try:
            bot = TreoBot(imei, cookies, account_name)
            self.bots[account_id] = bot
            return account_id, bot
        except Exception as e:
            print(f"{Colors.RED}❌ Lỗi tạo bot: {e}{Colors.RESET}")
            return None, None
    
    def get_all_status(self):
        """Lấy status từ tất cả tài khoản"""
        all_status = []
        for account_id, bot in self.bots.items():
            all_status.extend(bot.get_status())
        return all_status
    
    def stop_all(self):
        """Dừng tất cả bot"""
        for bot in self.bots.values():
            bot.stop_all_treo()


def add_account_interactive(manager):
    """Thêm tài khoản mới khi đang chạy"""
    print(f"\n{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}")
    print(f"{Colors.BOLD}➕ THÊM TÀI KHOẢN MỚI{Colors.RESET}")
    print(f"{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}\n")
    
    # Nhập thông tin tài khoản
    account_name = input(f"📛 Tên tài khoản (Enter = tự động): ").strip()
    imei = input(f"📱 IMEI: ").strip()
    
    if not imei:
        print(f"{Colors.RED}❌ IMEI không được để trống!{Colors.RESET}\n")
        return None
    
    cookie_str = input(f"🍪 Cookie (JSON): ").strip()
    
    try:
        cookies = json.loads(cookie_str)
    except:
        print(f"{Colors.RED}❌ Cookie không hợp lệ!{Colors.RESET}\n")
        return None
    
    # Thêm tài khoản
    print(f"\n{Colors.CYAN}🔄 Đang khởi tạo tài khoản...{Colors.RESET}")
    account_id, bot = manager.add_account(imei, cookies, account_name if account_name else None)
    
    if not bot:
        print(f"{Colors.RED}❌ Không thể tạo tài khoản!{Colors.RESET}\n")
        return None
    
    # Lấy danh sách nhóm
    print(f"{Colors.CYAN}🔍 Đang tải danh sách nhóm...{Colors.RESET}")
    groups = bot.fetch_groups()
    
    if not groups:
        print(f"{Colors.RED}❌ Không tìm thấy nhóm nào!{Colors.RESET}\n")
        return None
    
    print(f"{Colors.GREEN}✅ Tài khoản {bot.account_name} đã được thêm thành công!{Colors.RESET}")
    print(f"{Colors.GREEN}✅ Tìm thấy {len(groups)} nhóm{Colors.RESET}\n")
    
    # Hỏi có muốn bắt đầu treo ngay không
    start_now = input(f"🚀 Bắt đầu treo ngay? (y/n, mặc định n): ").strip().lower()
    
    if start_now == 'y':
        add_group_to_bot(bot)
    
    return bot


def add_group_to_bot(bot):
    """Thêm nhóm vào một bot cụ thể"""
    print(f"\n{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}")
    print(f"{Colors.BOLD}📱 THÊM NHÓM CHO: {bot.account_name}{Colors.RESET}")
    print(f"{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}\n")
    
    groups = bot.groups_cache
    
    if not groups:
        print(f"{Colors.RED}❌ Không có danh sách nhóm. Đang tải lại...{Colors.RESET}")
        groups = bot.fetch_groups()
        if not groups:
            print(f"{Colors.RED}❌ Không thể tải danh sách nhóm!{Colors.RESET}")
            return
    
    # Hiển thị danh sách nhóm
    print(f"{Colors.CYAN}📋 DANH SÁCH NHÓM:{Colors.RESET}\n")
    for i, g in enumerate(groups):
        count = bot.count_sessions_in_group(g['id'])
        if count > 0:
            print(f"  {i+1}. {g['name']} ✅ ({count} file đang treo)")
        else:
            print(f"  {i+1}. {g['name']}")
    
    print(f"\n{Colors.YELLOW}Gõ '0' để hủy{Colors.RESET}")
    
    # Chọn nhóm
    choice = input(f"\n👉 Chọn nhóm (số): ").strip()
    
    if choice == "0":
        print(f"{Colors.YELLOW}❌ Đã hủy{Colors.RESET}\n")
        return
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(groups):
            selected_group = groups[idx]
        else:
            print(f"{Colors.RED}❌ Số không hợp lệ!{Colors.RESET}\n")
            return
    except ValueError:
        print(f"{Colors.RED}❌ Vui lòng nhập số!{Colors.RESET}\n")
        return
    
    # Hỏi file
    print(f"\n{Colors.GREEN}📱 Nhóm được chọn: {selected_group['name']}{Colors.RESET}")
    filepath = input(f"\n📄 Đường dẫn file (hoặc '0' để hủy): ").strip()
    
    if filepath == "0":
        print(f"{Colors.YELLOW}❌ Đã hủy{Colors.RESET}\n")
        return
    
    if not os.path.exists(filepath):
        print(f"{Colors.RED}❌ File không tồn tại!{Colors.RESET}\n")
        return
    
    messages = bot.load_messages_from_file(filepath)
    
    if not messages:
        print(f"{Colors.RED}❌ File rỗng hoặc không đọc được!{Colors.RESET}\n")
        return
    
    print(f"{Colors.GREEN}✅ Đã tải {len(messages)} tin nhắn{Colors.RESET}")
    
    # Hiển thị độ dài tin nhắn
    for i, msg in enumerate(messages, 1):
        msg_len = len(msg)
        if msg_len > 3500:
            parts = len(bot.split_long_message(msg))
            print(f"{Colors.YELLOW}   ⚠️ Tin {i}: {msg_len} ký tự → sẽ chia thành {parts} phần{Colors.RESET}")
        else:
            print(f"{Colors.GREEN}   ✅ Tin {i}: {msg_len} ký tự{Colors.RESET}")
    
    # Hỏi delay và TTL
    delay_str = input(f"\n⏱️  Delay giữa các tin (giây, mặc định 20): ").strip()
    delay = int(delay_str) if delay_str.isdigit() else 20
    
    ttl_str = input(f"⌛ TTL - thời gian tin tồn tại (giây, 0 = vô hạn, mặc định 60): ").strip()
    ttl = int(ttl_str) if ttl_str.isdigit() else 60
    ttl = ttl if ttl > 0 else None
    
    # Bắt đầu treo
    print(f"\n{Colors.CYAN}🚀 Đang khởi động...{Colors.RESET}")
    
    bot.start_treo_session(
        selected_group['id'],
        selected_group['name'],
        messages,
        delay,
        ttl,
        os.path.basename(filepath)
    )
    
    print(f"{Colors.GREEN}✅ Đã thêm và bắt đầu treo!")
    print(f"   🔖 Tài khoản: {bot.account_name}")
    print(f"   📱 Nhóm: {selected_group['name']}")
    print(f"   📄 File: {os.path.basename(filepath)}")
    print(f"   ⏱️  Delay: {delay}s")
    print(f"   ⌛ TTL: {ttl}s")
    print(f"   📝 Tin nhắn dài sẽ tự động chia nhỏ{Colors.RESET}\n")


def run_treo_tool():
    clear_screen()
    
    draw_box("CÀI ĐẶT TOOL TREO ĐA SẮC MÀU - HỖ TRỢ TIN DÀI", [
        "📱 Nhập thông tin tài khoản Zalo đầu tiên",
        "✨ Tự động chia nhỏ tin nhắn dài"
    ], Colors.CYAN)
    
    account_name = input("\n📛 Tên tài khoản (Enter = Acc1): ").strip()
    imei = input("📱 IMEI: ").strip()
    cookie_str = input("🍪 Cookie (JSON): ").strip()
    
    try:
        cookies = json.loads(cookie_str)
    except:
        draw_box("LỖI", ["❌ Cookie không hợp lệ!"], Colors.RED)
        input("\nNhấn Enter để quay lại...")
        return
    
    # Khởi tạo manager và bot đầu tiên
    manager = MultiAccountManager()
    account_id, bot = manager.add_account(imei, cookies, account_name if account_name else None)
    
    if not bot:
        draw_box("LỖI", ["❌ Không thể tạo tài khoản!"], Colors.RED)
        input("\nNhấn Enter để quay lại...")
        return
    
    # Lấy danh sách nhóm
    print(f"\n{Colors.CYAN}🔍 Đang tải danh sách nhóm...{Colors.RESET}")
    groups = bot.fetch_groups()
    
    if not groups:
        draw_box("LỖI", ["❌ Không tìm thấy nhóm nào!"], Colors.RED)
        input("\nNhấn Enter để quay lại...")
        return
    
    # Dictionary để lưu thông tin nhóm đã chọn và các file
    group_file_map = {}
    
    while True:
        clear_screen()
        
        # Hiển thị danh sách nhóm với số session
        group_lines = []
        for i, g in enumerate(groups):
            count = bot.count_sessions_in_group(g['id'])
            if count > 0:
                group_lines.append(f"{i+1}. {g['name']} ✅ ({count} file)")
            else:
                group_lines.append(f"{i+1}. {g['name']}")
        
        draw_box(f"DANH SÁCH NHÓM - {bot.account_name}", group_lines, Colors.CYAN)
        
        print(f"\n{Colors.YELLOW}📋 HƯỚNG DẪN:{Colors.RESET}")
        print("  • Chọn nhóm để thêm file treo")
        print("  • Gõ 'done' để hoàn tất và bắt đầu")
        print("  • Gõ 'status' để xem cấu hình")
        print("  • Gõ 'clear' để xóa cấu hình\n")
        
        choice = input("👉 Chọn nhóm (số) hoặc lệnh: ").strip().lower()
        
        if choice == "done":
            if not group_file_map:
                print(f"{Colors.RED}❌ Chưa cấu hình nhóm nào!{Colors.RESET}")
                time.sleep(2)
                continue
            break
        elif choice == "status":
            if not group_file_map:
                print(f"{Colors.YELLOW}⚠️ Chưa có cấu hình nào{Colors.RESET}")
            else:
                print(f"\n{Colors.CYAN}📊 CẤU HÌNH HIỆN TẠI:{Colors.RESET}")
                for gid, files in group_file_map.items():
                    group = next((g for g in groups if g['id'] == gid), None)
                    if group:
                        print(f"\n  📱 {group['name']}:")
                        for idx, f in enumerate(files, 1):
                            print(f"     {idx}. 📄 {f['file']} (delay: {f['delay']}s, ttl: {f['ttl']}s)")
            input("\nNhấn Enter để tiếp tục...")
            continue
        elif choice == "clear":
            group_file_map.clear()
            print(f"{Colors.GREEN}✅ Đã xóa cấu hình!{Colors.RESET}")
            time.sleep(1)
            continue
        
        # Xử lý chọn nhóm
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(groups):
                selected_group = groups[idx]
                
                clear_screen()
                draw_box(f"THÊM FILE CHO: {selected_group['name']}", [
                    "📄 Nhập đường dẫn file chứa tin nhắn",
                    "",
                    "⚠️ LƯU Ý:",
                    "   • Toàn bộ file = 1 tin nhắn",
                    "   • Dùng --- để phân tách nhiều tin",
                    "   • Tin dài sẽ tự động chia nhỏ"
                ], Colors.GREEN)
                
                filepath = input("\n📄 File (Enter để bỏ qua): ").strip()
                
                if not filepath:
                    continue
                
                if not os.path.exists(filepath):
                    print(f"{Colors.RED}❌ File không tồn tại!{Colors.RESET}")
                    time.sleep(2)
                    continue
                
                messages = bot.load_messages_from_file(filepath)
                
                if not messages:
                    print(f"{Colors.RED}❌ File rỗng!{Colors.RESET}")
                    time.sleep(2)
                    continue
                
                print(f"{Colors.GREEN}✅ Đã tải {len(messages)} tin nhắn{Colors.RESET}")
                
                # Hiển thị độ dài tin nhắn
                for i, msg in enumerate(messages, 1):
                    msg_len = len(msg)
                    if msg_len > 3500:
                        parts = len(bot.split_long_message(msg))
                        print(f"{Colors.YELLOW}   ⚠️ Tin {i}: {msg_len} ký tự → chia {parts} phần{Colors.RESET}")
                    else:
                        print(f"{Colors.GREEN}   ✅ Tin {i}: {msg_len} ký tự{Colors.RESET}")
                
                delay_str = input("\n⏱️  Delay (giây, mặc định 20): ").strip()
                delay = int(delay_str) if delay_str.isdigit() else 20
                
                ttl_str = input("⌛ TTL (giây, 0 = vô hạn, mặc định 60): ").strip()
                ttl = int(ttl_str) if ttl_str.isdigit() else 60
                ttl = ttl if ttl > 0 else None
                
                if selected_group['id'] not in group_file_map:
                    group_file_map[selected_group['id']] = []
                
                group_file_map[selected_group['id']].append({
                    'file': filepath,
                    'delay': delay,
                    'ttl': ttl,
                    'messages': messages,
                    'name': selected_group['name']
                })
                
                print(f"\n{Colors.GREEN}✅ Đã thêm file!{Colors.RESET}")
                time.sleep(2)
            else:
                print(f"{Colors.RED}❌ Số không hợp lệ!{Colors.RESET}")
                time.sleep(1)
        except ValueError:
            print(f"{Colors.RED}❌ Vui lòng nhập số!{Colors.RESET}")
            time.sleep(1)
    
    # Bắt đầu treo
    clear_screen()
    draw_box("🚀 ĐANG KHỞI ĐỘNG", [
        f"🔖 Tài khoản: {bot.account_name}",
        f"📊 Số nhóm: {len(group_file_map)}",
        f"📄 Số file: {sum(len(files) for files in group_file_map.values())}",
        "",
        "🎨 Chế độ: Đa sắc màu + Tự động chia tin dài"
    ], Colors.GREEN)
    
    for group_id, files in group_file_map.items():
        group = next((g for g in groups if g['id'] == group_id), None)
        if not group:
            continue
        
        print(f"\n{Colors.CYAN}📱 Nhóm: {group['name']}{Colors.RESET}")
        
        for file_config in files:
            bot.start_treo_session(
                group_id,
                group['name'],
                file_config['messages'],
                file_config['delay'],
                file_config['ttl'],
                os.path.basename(file_config['file'])
            )
            print(f"  ✅ {os.path.basename(file_config['file'])} - delay: {file_config['delay']}s, ttl: {file_config['ttl']}s")
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}")
    print(f"{Colors.BOLD}🎯 TOOL ĐANG CHẠY - Nhấn Enter để xem menu{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*UI_WIDTH}{Colors.RESET}\n")
    
    # Menu quản lý
    while True:
        cmd = input().strip().lower()
        
        if cmd == "":
            print("\n📊 MENU QUẢN LÝ:")
            print("  themacc - Thêm tài khoản mới")
            print("  groupadd - Thêm nhóm cho tài khoản hiện có")
            print("  status - Xem trạng thái tất cả")
            print("  listacc - Danh sách tài khoản")
            print("  stopall - Dừng tất cả")
            print("  exit - Thoát")
            print()
        elif cmd == "themacc":
            new_bot = add_account_interactive(manager)
            if new_bot:
                print(f"{Colors.GREEN}✅ Thêm tài khoản thành công!{Colors.RESET}\n")
        elif cmd == "groupadd":
            # Chọn tài khoản để thêm nhóm
            print(f"\n{Colors.CYAN}📋 DANH SÁCH TÀI KHOẢN:{Colors.RESET}\n")
            bot_list = list(manager.bots.items())
            for i, (acc_id, b) in enumerate(bot_list, 1):
                session_count = sum(len(sessions) for sessions in b.sessions.values())
                print(f"  {i}. {b.account_name} ({session_count} session đang chạy)")
            
            choice = input(f"\n👉 Chọn tài khoản (số): ").strip()
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(bot_list):
                    selected_bot = bot_list[idx][1]
                    add_group_to_bot(selected_bot)
                else:
                    print(f"{Colors.RED}❌ Số không hợp lệ!{Colors.RESET}\n")
            except ValueError:
                print(f"{Colors.RED}❌ Vui lòng nhập số!{Colors.RESET}\n")
        elif cmd == "listacc":
            print(f"\n{Colors.CYAN}📋 DANH SÁCH TÀI KHOẢN:{Colors.RESET}\n")
            for i, (acc_id, b) in enumerate(manager.bots.items(), 1):
                session_count = sum(len(sessions) for sessions in b.sessions.values())
                print(f"  {i}. {b.account_name} ({session_count} session đang chạy)")
            print()
        elif cmd == "status":
            all_status = manager.get_all_status()
            if not all_status:
                print(f"\n{Colors.YELLOW}⚠️ Không có session nào đang chạy{Colors.RESET}\n")
            else:
                print(f"\n{Colors.CYAN}📊 TRẠNG THÁI TẤT CẢ:{Colors.RESET}\n")
                for s in all_status:
                    print(f"  🔖 {s['account_name']} | 📱 {s['group_name']}")
                    print(f"     📄 {s['file_name']} | Index: {s['index']} | Delay: {s['delay']}s | TTL: {s['ttl']}s")
                    print()
        elif cmd == "stopall":
            confirm = input(f"\n{Colors.YELLOW}⚠️ Dừng tất cả session? (y/n): {Colors.RESET}").strip().lower()
            if confirm == 'y':
                manager.stop_all()
                print(f"{Colors.GREEN}✅ Đã dừng tất cả!{Colors.RESET}\n")
        elif cmd == "exit":
            confirm = input(f"\n{Colors.YELLOW}⚠️ Thoát tool? (y/n): {Colors.RESET}").strip().lower()
            if confirm == 'y':
                manager.stop_all()
                print(f"{Colors.GREEN}✅ Đã thoát!{Colors.RESET}")
                break
        else:
            print(f"{Colors.RED}❌ Lệnh không hợp lệ!{Colors.RESET}\n")


if __name__ == "__main__":
    run_treo_tool()