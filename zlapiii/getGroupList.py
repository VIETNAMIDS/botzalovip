import requests
import re
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from zlapi.models import Message

class ZaloClient:
    def __init__(self, session):
        """
        Khởi tạo client với session đã đăng nhập Zalo
        :param session: requests.Session() đã đăng nhập
        """
        self.session = session
        self.base_url = "https://chat.zalo.me"

    def getGroupList(self):
        """
        Lấy danh sách nhóm mà tài khoản đang tham gia
        :return: Danh sách nhóm (id, name, link_code, avatar, memberCount)
        """
        url = f"{self.base_url}/api/v2/conversations?type=group"
        headers = {
            "accept": "application/json",
        }
        response = self.session.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        groups = []
        for convo in data.get("data", []):
            if convo.get("isGroup"):
                groups.append({
                    "id": convo.get("conversationId"),
                    "name": convo.get("name"),
                    "link_code": convo.get("linkInfo", {}).get("code", ""),
                    "avatar": convo.get("avatar"),
                    "memberCount": convo.get("memberCount")
                })

        return groups

    def getGroupInfoByLink(self, group_code):
        """
        Lấy thông tin nhóm từ mã link zalo.me/g/<group_code>
        :param group_code: Mã nhóm (link code)
        :return: Thông tin nhóm
        """
        groups = self.getGroupList()
        for group in groups:
            if group.get("link_code") == group_code:
                return group
        raise Exception("Không tìm thấy nhóm với mã link đã cung cấp.")

def login_zalo_and_get_session():
    """
    Đăng nhập Zalo tự động và lấy cookie từ trình duyệt
    :return: Session đã đăng nhập
    """
    chrome_options = Options()
    chrome_options.add_argument("--start-maximized")

    driver = webdriver.Chrome(ChromeDriverManager().install(), options=chrome_options)
    driver.get("https://chat.zalo.me")

    print(">> Vui lòng đăng nhập Zalo thủ công (bằng số điện thoại hoặc quét QR)...")
    input("Sau khi đăng nhập xong và vào giao diện chat Zalo Web, nhấn Enter để tiếp tục...")

    # Lấy cookie từ trình duyệt
    cookies = driver.get_cookies()
    driver.quit()

    # Tạo session requests và thêm cookie vào
    session = requests.Session()
    for cookie in cookies:
        session.cookies.set(cookie["name"], cookie["value"])

    return session

def extract_group_code(text):
    """
    Trích xuất mã nhóm từ link zalo.me/g/xxxx
    :param text: Nội dung tin nhắn có chứa link nhóm
    :return: Mã nhóm (group_code)
    """
    match = re.search(r"zalo\.me/g/([a-zA-Z0-9]+)", text)
    return match.group(1) if match else None

def handle_group_id_command(message, message_object, thread_id, thread_type, author_id, client):
    """
    Xử lý lệnh lấy ID nhóm từ thread ID hoặc từ link nhóm
    :param message: Tin nhắn nhận được
    :param message_object: Đối tượng message
    :param thread_id: ID của thread (nhóm)
    :param thread_type: Loại thread (nhóm)
    :param author_id: ID người gửi
    :param client: ZaloClient đã đăng nhập
    """
    text = message.text.strip()
    group_code = extract_group_code(text)

    if group_code:
        try:
            group_info = client.getGroupInfoByLink(group_code)
            group_id = group_info.get("id")
            group_name = group_info.get("name", "Không rõ")

            response_message = f"🔗 Link nhóm: https://zalo.me/g/{group_code}\n🆔 ID Nhóm: {group_id}\n📛 Tên nhóm: {group_name}"
        except Exception as e:
            response_message = f"❌ Không thể lấy ID từ link nhóm:\n{str(e)}"
    else:
        response_message = f"🚦 ID Nhóm hiện tại là 🐰: {thread_id}"

    message_to_send = Message(text=response_message)
    client.replyMessage(message_to_send, message_object, thread_id, thread_type, ttl=60000)
    client.sendReaction(message_object, "🤲", thread_id, thread_type, reactionType=75)

def get_mitaizl():
    """
    Trả về các lệnh của bot
    :return: dict chứa lệnh và hàm xử lý
    """
    return {
        'idgr': handle_group_id_command
    }