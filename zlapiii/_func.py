def func(obj):
    """Thay đổi tên hàm ngắn gọn - nhanh chóng"""
    aliases = {
        "s": "send",
        "r": "replyMessage",
        "sCall": "sendCall",
        "sImg": "sendLocalImage",
        "sMImg": "sendMultiLocalImage",
        "sTD": "sendToDo",
        
        
        
    }
    for short, full in aliases.items():
        if hasattr(obj, full):
            setattr(obj, short, getattr(obj, full))