const { ThreadType } = require("zca-js");

module.exports.config = {
  name: 'kickall',
  version: '1.0.0',
  role: 2, // Chỉ admin bot mới được dùng
  author: 'Cascade',
  description: 'Kick tất cả thành viên không phải admin khỏi nhóm',
  category: 'Quản lý nhóm',
  usage: 'kickall',
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
  
  // Kiểm tra xem có phải trong nhóm không
  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ có thể sử dụng trong nhóm!", threadId, type);
  }

  // Kiểm tra quyền admin bot
  if (!global.users.admin.includes(senderID.toString())) {
    return api.sendMessage("❌ Bạn không phải admin bot!", threadId, type);
  }

  try {
    // Gửi cảnh báo trước khi thực hiện
    await api.sendMessage(
      "⚠️ CẢNH BÁO: Đang thực hiện kick tất cả thành viên không phải admin!\n\n" +
      "🔄 Bắt đầu xử lý...",
      threadId, type
    );

    // Lấy thông tin nhóm
    const groupInfo = await api.getGroupInfo(threadId);
    if (!groupInfo || !groupInfo.gridInfoMap || !groupInfo.gridInfoMap[threadId]) {
      return api.sendMessage("❌ Không thể lấy thông tin nhóm!", threadId, type);
    }

    const groupDetails = groupInfo.gridInfoMap[threadId];

    // Lấy danh sách admin nhóm
    const groupAdmins = new Set();
    
    // Thêm creator vào danh sách admin
    if (groupDetails.creatorId) {
      groupAdmins.add(groupDetails.creatorId.toString());
    }

    // Thêm các admin khác vào danh sách
    if (groupDetails.adminIds && Array.isArray(groupDetails.adminIds)) {
      groupDetails.adminIds.forEach(adminId => {
        groupAdmins.add(adminId.toString());
      });
    }

    // Thêm bot admins vào danh sách được bảo vệ
    global.users.admin.forEach(adminId => {
      groupAdmins.add(adminId.toString());
    });

    // Lấy danh sách tất cả thành viên từ memVerList
    const allMembers = groupDetails.memVerList || [];
    
    // Lọc ra những thành viên không phải admin
    const membersToKick = allMembers.filter(member => {
      // memVerList có format như "userId_version", ta chỉ lấy userId
      const memberId = member.split('_')[0];
      return !groupAdmins.has(memberId.toString());
    }).map(member => member.split('_')[0]); // Chỉ lấy userId

    if (membersToKick.length === 0) {
      return api.sendMessage("ℹ️ Không có thành viên nào để kick (chỉ có admin trong nhóm).", threadId, type);
    }

    // Thông báo bắt đầu kick
    await api.sendMessage(
      `🚀 Bắt đầu kick ${membersToKick.length} thành viên...\n` +
      `👑 Số admin được bảo vệ: ${groupAdmins.size}`,
      threadId, type
    );

    let kickedCount = 0;
    let failedCount = 0;
    const kickResults = [];

    // Kick từng thành viên
    for (const memberId of membersToKick) {
      try {
        // Thử lấy thông tin user trước khi kick
        let userName = "Unknown";
        try {
          const userInfo = await api.getUserInfo(memberId);
          if (userInfo && userInfo[memberId]) {
            userName = userInfo[memberId].name || "Unknown";
          }
        } catch (e) {
          // Bỏ qua lỗi lấy tên
        }

        // Bước 1: Block user trước (để tránh join lại ngay lập tức)
        let blocked = false;
        const blockMethods = [
          async () => { if (typeof api.blockUsersInGroup === 'function') { await api.blockUsersInGroup(memberId, threadId); return 'blockUsersInGroup'; } },
          async () => { if (typeof api.blockUser === 'function') { await api.blockUser(memberId, threadId); return 'blockUser'; } },
          async () => { if (typeof api.banUser === 'function') { await api.banUser(memberId, threadId); return 'banUser'; } }
        ];

        for (const method of blockMethods) {
          try {
            const result = await method();
            if (result) {
              blocked = true;
              break;
            }
          } catch (e) {
            // Thử method tiếp theo hoặc bỏ qua nếu không có block method
            continue;
          }
        }

        // Bước 2: Kick user khỏi nhóm
        let kicked = false;
        const kickMethods = [
          async () => { if (typeof api.kickUsersInGroup === 'function') { await api.kickUsersInGroup(memberId, threadId); return 'kickUsersInGroup'; } },
          async () => { if (typeof api.removeUserFromGroup === 'function') { await api.removeUserFromGroup(memberId, threadId); return 'removeUserFromGroup'; } },
          async () => { if (typeof api.removeParticipant === 'function') { await api.removeParticipant(threadId, memberId); return 'removeParticipant'; } },
          async () => { if (typeof api.removeMember === 'function') { await api.removeMember(threadId, memberId); return 'removeMember'; } },
          async () => { if (typeof api.kick === 'function') { await api.kick(memberId, threadId); return 'kick'; } }
        ];

        for (const method of kickMethods) {
          try {
            const result = await method();
            if (result) {
              kicked = true;
              break;
            }
          } catch (e) {
            // Thử method tiếp theo
            continue;
          }
        }

        if (!kicked) {
          throw new Error("Không thể kick user bằng bất kỳ method nào");
        }
        
        kickedCount++;
        const blockStatus = blocked ? "🚫" : "⚠️";
        kickResults.push(`✅ ${blockStatus} ${userName} (${memberId})`);
        
        // Delay nhỏ để tránh spam API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        failedCount++;
        kickResults.push(`❌ ${memberId} - Lỗi: ${error.message}`);
        console.error(`Lỗi kick user ${memberId}:`, error);
      }
    }

    // Tạo báo cáo kết quả
    let resultMessage = `🎯 KẾT QUẢ KICK ALL:\n\n`;
    resultMessage += `✅ Đã kick: ${kickedCount} thành viên\n`;
    resultMessage += `❌ Thất bại: ${failedCount} thành viên\n`;
    resultMessage += `👑 Admin được bảo vệ: ${groupAdmins.size}\n\n`;

    // Hiển thị chi tiết (giới hạn để tránh tin nhắn quá dài)
    if (kickResults.length > 0) {
      resultMessage += `📋 CHI TIẾT:\n`;
      const maxResults = 20; // Giới hạn hiển thị
      const displayResults = kickResults.slice(0, maxResults);
      resultMessage += displayResults.join('\n');
      
      if (kickResults.length > maxResults) {
        resultMessage += `\n... và ${kickResults.length - maxResults} kết quả khác`;
      }
    }

    // Gửi báo cáo cuối cùng
    await api.sendMessage(resultMessage, threadId, type);

    // Gửi tin nhắn hoàn thành
    if (kickedCount > 0) {
      await api.sendMessage("🎉 Đã hoàn thành việc dọn dẹp nhóm!", threadId, type);
    }

  } catch (error) {
    console.error('Lỗi trong lệnh kickall:', error);
    return api.sendMessage(
      `❌ Có lỗi xảy ra: ${error.message}\n\n` +
      "Vui lòng thử lại sau hoặc liên hệ admin bot.",
      threadId, type
    );
  }
};
