import requests

def get_user_info(uid, access_token):
    url = f"https://openapi.zalo.me/v2.0/oa/getprofile?uid={uid}"
    headers = {
        "access_token": access_token
    }
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        if data["error"] == 0:
            user_info = data["data"]
            return user_info
        else:
            print(f"Lỗi API: {data['message']}")
            return None
    else:
        print(f"HTTP Error: {response.status_code}")
        return None

# Thay UID và access_token bằng giá trị của bạn
uid = "6502284422"
access_token = "7560516817:AAGiTyO0Elh1PfugLvPAJLhuevdTyu8ii5w"

info = get_user_info(uid, access_token)
if info:
    print(f"UID: {info['user_id']}")
    print(f"Tên: {info['display_name']}")
    print(f"Giới tính: {info.get('gender', 'Không rõ')}")
    print(f"Avatar: {info.get('avatar', 'Không có')}")
