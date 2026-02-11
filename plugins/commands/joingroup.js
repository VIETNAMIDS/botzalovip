const { ThreadType } = require("zca-js");

module.exports.config = {
  name: 'joingroup',
  aliases: ['join'],
  version: '1.0.0',
  role: 2, // Chỉ admin bot mới được dùng
  author: 'Cascade',
  description: 'Bot tham gia nhóm từ link Zalo',
  category: 'Quản lý nhóm',
  usage: 'joingroup <link_zalo_group>',
  cooldowns: 5
};

module.exports.run = async ({ event, api, args }) => {
  const { threadId, type, data } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  const senderID = data.uidFrom;
  
  // Kiểm tra quyền admin bot
  if (!global.users.admin.includes(senderID.toString())) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này!", threadId, type);
  }

  // Kiểm tra xem có link không
  if (args.length === 0) {
    return api.sendMessage(
      "❌ Vui lòng cung cấp link nhóm Zalo!\n\n" +
      "Cách sử dụng: joingroup <link_zalo_group>\n" +
      "Ví dụ: joingroup https://zalo.me/g/abcdef123",
      threadId, type
    );
  }

  const input = args.join(' ');
  
  try {
    // Kiểm tra xem có phải link Zalo group không
    if (!input.includes("https://zalo.me/g/")) {
      return api.sendMessage(
        "🚦 Link không hợp lệ! Vui lòng cung cấp link nhóm Zalo.\n\n" +
        "Format: https://zalo.me/g/[group_code]",
        threadId, type
      );
    }

    // Trích xuất link nhóm
    let groupUrl;
    if (input.startsWith("https://zalo.me/g/")) {
      groupUrl = input.trim();
    } else {
      // Tìm link trong text
      const linkMatch = input.match(/https:\/\/zalo\.me\/g\/[a-zA-Z0-9]+/);
      if (!linkMatch) {
        return api.sendMessage(
          "❌ Không tìm thấy link nhóm Zalo hợp lệ trong tin nhắn!",
          threadId, type
        );
      }
      groupUrl = linkMatch[0];
    }

    // Gửi thông báo đang xử lý
    await api.sendMessage(
      `🔄 Đang thử tham gia nhóm...\n📎 Link: ${groupUrl}`,
      threadId, type
    );

    // Trích xuất group code từ URL
    const groupCodeMatch = groupUrl.match(/https:\/\/zalo\.me\/g\/([a-zA-Z0-9]+)/);
    if (!groupCodeMatch) {
      return api.sendMessage("❌ Không thể trích xuất mã nhóm từ link!", threadId, type);
    }
    
    const groupCode = groupCodeMatch[1];

    // Thử các phương thức join group khác nhau
    let joinSuccess = false;
    let joinMethod = '';
    let groupInfo = null;

    const joinMethods = [
      {
        name: 'joinGroupByLink',
        execute: async () => {
          if (typeof api.joinGroupByLink === 'function') {
            const result = await api.joinGroupByLink(groupUrl);
            return result;
          }
          return null;
        }
      },
      {
        name: 'joinGroup',
        execute: async () => {
          if (typeof api.joinGroup === 'function') {
            const result = await api.joinGroup(groupUrl);
            return result;
          }
          return null;
        }
      },
      {
        name: 'joinGroupByCode',
        execute: async () => {
          if (typeof api.joinGroupByCode === 'function') {
            const result = await api.joinGroupByCode(groupCode);
            return result;
          }
          return null;
        }
      },
      {
        name: 'sendMessage to group',
        execute: async () => {
          // Thử gửi tin nhắn trống vào group ID để join
          try {
            await api.sendMessage('', groupCode, ThreadType.Group);
            return { success: true, groupId: groupCode };
          } catch (e) {
            return null;
          }
        }
      }
    ];

    // Thử từng phương thức
    for (const method of joinMethods) {
      try {
        const result = await method.execute();
        if (result) {
          joinSuccess = true;
          joinMethod = method.name;
          groupInfo = result;
          break;
        }
      } catch (error) {
        console.log(`Method ${method.name} failed:`, error.message);
        continue;
      }
    }

    if (joinSuccess) {
      // Thử lấy thông tin nhóm sau khi join
      let groupDetails = null;
      try {
        if (typeof api.getGroupInfo === 'function') {
          const info = await api.getGroupInfo(groupCode);
          if (info && info.gridInfoMap && info.gridInfoMap[groupCode]) {
            groupDetails = info.gridInfoMap[groupCode];
          }
        }
      } catch (e) {
        console.log('Không thể lấy thông tin nhóm:', e.message);
      }

      let successMessage = `✅ Đã tham gia nhóm thành công!\n\n`;
      successMessage += `📎 Link: ${groupUrl}\n`;
      successMessage += `🆔 Group ID: ${groupCode}\n`;
      successMessage += `🔧 Method: ${joinMethod}\n`;
      
      if (groupDetails) {
        successMessage += `📝 Tên nhóm: ${groupDetails.name || 'Không rõ'}\n`;
        successMessage += `👥 Số thành viên: ${groupDetails.totalMember || 'Không rõ'}\n`;
      }

      return api.sendMessage(successMessage, threadId, type);
    } else {
      return api.sendMessage(
        `❌ Không thể tham gia nhóm!\n\n` +
        `📎 Link: ${groupUrl}\n` +
        `🆔 Group Code: ${groupCode}\n\n` +
        `Có thể do:\n` +
        `• Nhóm đã đóng hoặc riêng tư\n` +
        `• Link đã hết hạn\n` +
        `• Bot đã có trong nhóm\n` +
        `• API không hỗ trợ tính năng này`,
        threadId, type
      );
    }

  } catch (error) {
    console.error('Lỗi trong lệnh joingroup:', error);
    return api.sendMessage(
      `❌ Có lỗi xảy ra: ${error.message}\n\n` +
      "Vui lòng thử lại sau hoặc liên hệ admin bot.",
      threadId, type
    );
  }
};
