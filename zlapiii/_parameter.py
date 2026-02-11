def parameter(func):
    """Thay đổi tham số của hàm ngắn gọn & dễ sử dụng"""
    
    def wrapper(self, mid, author_id, message, message_object, thread_id, thread_type):
        return func(self,
                    mid,
                    athId=author_id,
                    msg=message,
                    msgObj=message_object,
                    thrId=thread_id,
                    thrType=thread_type)
    return wrapper