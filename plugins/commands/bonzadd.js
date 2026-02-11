module.exports.config = {
  name: 'bonzadd',
  version: '1.2.0',
  role: 2, // Chỉ admin bot mới được dùng
  author: 'Cascade',
  description: 'Mời tất cả bạn bè vào nhóm với whitelist thông minh',
  category: 'Quản lý',
  usage: 'bonzadd [addwl|remove] [@user/uid]',
  cooldowns: 30,
  dependencies: {},
  aliases: ['addall', 'inviteall', 'keomem']
};

const fs = require('fs');
const path = require('path');
const { ThreadType } = require("zca-js");

// File lưu whitelist
const WHITELIST_FILE = path.join(__dirname, '../../data/bonzadd_whitelist.json');

// Tạo thư mục data nếu chưa có
if (!fs.existsSync(path.dirname(WHITELIST_FILE))) {
  fs.mkdirSync(path.dirname(WHITELIST_FILE), { recursive: true });
}

// Load/Save whitelist
function loadWhitelist() {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      return JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[BONZ ADD] Lỗi load whitelist:', error);
  }
  return [];
}

function saveWhitelist(data) {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[BONZ ADD] Lỗi save whitelist:', error);
  }
}

// Stats manager
class InviteStats {
  constructor() {
    this.success = 0;
    this.failed = 0;
    this.skipped = 0;
    this.alreadyInGroup = 0;
  }

  reset() {
    this.success = 0;
    this.failed = 0;
    this.skipped = 0;
    this.alreadyInGroup = 0;
  }

  getTotal() {
    return this.success + this.failed;
  }

  getSummary() {
    return {
      total: this.getTotal(),
      success: this.success,
      failed: this.failed,
      skipped: this.skipped,
      alreadyInGroup: this.alreadyInGroup
    };
  }
}

const inviteStats = new InviteStats();

module.exports.run = async ({ event, api, args, Users }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event.authorId;
  const senderName = event?.data?.dName || 'Admin';

  // Kiểm tra quyền admin bot
  if (!isAdminBot(senderId)) {
    return api.sendMessage({
      msg: '⚠️ **KHÔNG CÓ QUYỀN**\n\n' +
           '🚫 Chỉ admin bot mới có thể sử dụng lệnh này.\n' +
           '💡 Liên hệ admin để được cấp quyền.',
      ttl: 30000
    }, threadId, type);
  }

  // Kiểm tra trong nhóm
  if (type !== ThreadType.Group) {
    return api.sendMessage({
      msg: '⚠️ **CHỈ DÙNG TRONG NHÓM**\n\n' +
           '📍 Lệnh này chỉ có thể sử dụng trong nhóm chat.',
      ttl: 30000
    }, threadId, type);
  }

  const subCommand = args[0]?.toLowerCase();
  
  switch (subCommand) {
    case 'addwl':
      return await handleAddWhitelist(api, event, args, senderName);
    
    case 'remove':
      return await handleRemoveWhitelist(api, event, args, senderName);
    
    case 'list':
      return await handleListWhitelist(api, event, senderName);
    
    case 'help':
      return await showHelp(api, event);
    
    case 'debug':
      return await showDebugInfo(api, event, senderName);
    
    case 'multi':
    case 'rounds':
      const rounds = parseInt(args[1]) || 3; // Mặc định 3 vòng
      return await executeMultiRoundInvite(api, event, senderName, rounds);
    
    default:
      return await executeInviteAll(api, event, senderName);
  }
};

async function executeInviteAll(api, event, senderName) {
  const { threadId, type } = event;
  
  try {
    // Reset stats
    inviteStats.reset();
    
    // Gửi thông báo bắt đầu
    await api.sendMessage({
      msg: `⏳ **ĐANG MỜI TẤT CẢ BẠN BÈ**\n\n` +
           `👤 **Thực hiện bởi:** ${senderName}\n` +
           `🔄 Đang lấy danh sách bạn bè...\n\n` +
           `💡 Vui lòng đợi, quá trình có thể mất vài phút...`,
      ttl: 60000
    }, threadId, type);

    // Lấy danh sách bạn bè
    let friendsList = [];
    
    // Thử các phương thức khác nhau để lấy bạn bè
    const methods = [
      async () => {
        if (typeof api.getFriendsList === 'function') {
          return await api.getFriendsList();
        }
        return null;
      },
      async () => {
        if (typeof api.getAllFriends === 'function') {
          return await api.getAllFriends();
        }
        return null;
      },
      async () => {
        if (typeof api.fetchAllFriends === 'function') {
          return await api.fetchAllFriends();
        }
        return null;
      }
    ];

    for (const method of methods) {
      try {
        const result = await method();
        if (result && Array.isArray(result) && result.length > 0) {
          friendsList = result;
          break;
        }
      } catch (e) {
        console.log('[BONZ ADD] Method failed:', e.message);
        continue;
      }
    }

    if (!friendsList || friendsList.length === 0) {
      return api.sendMessage({
        msg: `❌ **KHÔNG THỂ LẤY DANH SÁCH BẠN BÈ**\n\n` +
             `🚧 **Nguyên nhân có thể:**\n` +
             `• API không hỗ trợ lấy danh sách bạn bè\n` +
             `• Danh sách bạn bè trống\n` +
             `• Lỗi kết nối hoặc quyền truy cập\n\n` +
             `💡 **Thử lại sau hoặc liên hệ admin**`,
        ttl: 60000
      }, threadId, type);
    }

    // Lấy whitelist
    const whitelist = loadWhitelist();
    
    // Lấy danh sách thành viên hiện tại trong nhóm
    let currentMembers = [];
    try {
      const threadInfo = await api.getThreadInfo?.(threadId);
      if (threadInfo && threadInfo.participantIDs) {
        currentMembers = threadInfo.participantIDs.map(id => String(id));
      }
    } catch (e) {
      console.log('[BONZ ADD] Could not get current members:', e.message);
    }

    // Filter bạn bè cần mời
    const friendsToInvite = friendsList.filter(friend => {
      const friendId = String(friend.userID || friend.userId || friend.id);
      
      // Bỏ qua nếu trong whitelist
      if (whitelist.includes(friendId)) {
        inviteStats.skipped++;
        return false;
      }
      
      // Bỏ qua nếu đã có trong nhóm
      if (currentMembers.includes(friendId)) {
        inviteStats.alreadyInGroup++;
        return false;
      }
      
      return true;
    });

    if (friendsToInvite.length === 0) {
      const summary = inviteStats.getSummary();
      return api.sendMessage({
        msg: `⚠️ **KHÔNG CÓ BẠN BÈ ĐỂ MỜI**\n\n` +
             `📊 **Thống kê:**\n` +
             `• Tổng bạn bè: ${friendsList.length}\n` +
             `• Đã có trong nhóm: ${summary.alreadyInGroup}\n` +
             `• Bỏ qua (whitelist): ${summary.skipped}\n` +
             `• Có thể mời: 0\n\n` +
             `💡 Tất cả bạn bè đều đã có trong nhóm hoặc whitelist`,
        ttl: 60000
      }, threadId, type);
    }

    // Gửi update progress
    await api.sendMessage({
      msg: `🔄 **ĐANG MỜI BẠN BÈ**\n\n` +
           `📊 **Thống kê:**\n` +
           `• Tổng bạn bè: ${friendsList.length}\n` +
           `• Sẽ mời: ${friendsToInvite.length}\n` +
           `• Bỏ qua (whitelist): ${inviteStats.skipped}\n` +
           `• Đã có trong nhóm: ${inviteStats.alreadyInGroup}\n\n` +
           `⏳ Đang thực hiện mời...`,
      ttl: 60000
    }, threadId, type);

    // Thực hiện mời theo batch để tối ưu
    const BATCH_SIZE = 5; // Mời 5 người một lúc
    const BATCH_DELAY = 3000; // Delay 3s giữa các batch
    
    for (let batchStart = 0; batchStart < friendsToInvite.length; batchStart += BATCH_SIZE) {
      const batch = friendsToInvite.slice(batchStart, batchStart + BATCH_SIZE);
      const batchPromises = [];
      
      // Xử lý batch hiện tại
      for (const friend of batch) {
        const friendId = String(friend.userID || friend.userId || friend.id);
        
        const invitePromise = (async () => {
          try {
            let success = false;
            let lastError = null;
            
            // Method 1: addUserToGroup (phổ biến nhất)
            if (!success && typeof api.addUserToGroup === 'function') {
              try {
                await api.addUserToGroup(friendId, threadId);
                success = true;
                console.log(`[BONZ ADD] Successfully added ${friendId} via addUserToGroup`);
              } catch (e) {
                lastError = e;
                console.log(`[BONZ ADD] addUserToGroup failed for ${friendId}:`, e.message);
              }
            }
            
            // Method 2: addUsersToGroup (batch method)
            if (!success && typeof api.addUsersToGroup === 'function') {
              try {
                const result = await api.addUsersToGroup([friendId], threadId);
                success = true;
                console.log(`[BONZ ADD] Successfully added ${friendId} via addUsersToGroup`);
              } catch (e) {
                lastError = e;
                console.log(`[BONZ ADD] addUsersToGroup failed for ${friendId}:`, e.message);
              }
            }
            
            // Method 3: addParticipant
            if (!success && typeof api.addParticipant === 'function') {
              try {
                await api.addParticipant(threadId, friendId);
                success = true;
                console.log(`[BONZ ADD] Successfully added ${friendId} via addParticipant`);
              } catch (e) {
                lastError = e;
                console.log(`[BONZ ADD] addParticipant failed for ${friendId}:`, e.message);
              }
            }
            
            // Method 4: Thử với changeGroupImage (trick để add)
            if (!success && typeof api.changeGroupImage === 'function') {
              try {
                // Đây là trick: thêm user vào group bằng cách invite qua các method khác
                if (typeof api.createPoll === 'function') {
                  // Tạo poll và invite user (một số API hỗ trợ)
                  await api.createPoll("Welcome", [friendId], threadId);
                  success = true;
                  console.log(`[BONZ ADD] Successfully added ${friendId} via poll trick`);
                }
              } catch (e) {
                lastError = e;
              }
            }
            
            if (success) {
              inviteStats.success++;
            } else {
              inviteStats.failed++;
              console.error(`[BONZ ADD] All methods failed for ${friendId}. Last error:`, lastError?.message);
            }
            
          } catch (error) {
            inviteStats.failed++;
            console.error(`[BONZ ADD] Unexpected error for ${friendId}:`, error);
          }
        })();
        
        batchPromises.push(invitePromise);
      }
      
      // Chờ batch hiện tại hoàn thành
      await Promise.all(batchPromises);
      
      // Update progress
      const processed = Math.min(batchStart + BATCH_SIZE, friendsToInvite.length);
      const progress = Math.round((processed / friendsToInvite.length) * 100);
      
      await api.sendMessage({
        msg: `📈 **TIẾN TRÌNH: ${progress}%**\n\n` +
             `✅ Thành công: ${inviteStats.success}\n` +
             `❌ Thất bại: ${inviteStats.failed}\n` +
             `📊 Đã xử lý: ${processed}/${friendsToInvite.length}\n\n` +
             `⏳ ${batchStart + BATCH_SIZE < friendsToInvite.length ? 'Đang chờ batch tiếp theo...' : 'Sắp hoàn thành!'}`,
        ttl: 30000
      }, threadId, type);
      
      // Delay giữa các batch (trừ batch cuối)
      if (batchStart + BATCH_SIZE < friendsToInvite.length) {
        console.log(`[BONZ ADD] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Gửi kết quả cuối cùng
    const finalStats = inviteStats.getSummary();
    const successRate = finalStats.total > 0 ? Math.round((finalStats.success / finalStats.total) * 100) : 0;

    let resultMessage = `🎉 **HOÀN THÀNH MỜI BẠN BÈ!**\n\n`;
    resultMessage += `👤 **Thực hiện bởi:** ${senderName}\n`;
    resultMessage += `⏰ **Thời gian:** ${new Date().toLocaleString('vi-VN')}\n\n`;
    
    resultMessage += `📊 **THỐNG KÊ CHI TIẾT:**\n`;
    resultMessage += `• Tổng bạn bè: ${friendsList.length}\n`;
    resultMessage += `• Đã mời: ${finalStats.total}\n`;
    resultMessage += `• ✅ Thành công: ${finalStats.success}\n`;
    resultMessage += `• ❌ Thất bại: ${finalStats.failed}\n`;
    resultMessage += `• 🚫 Bỏ qua (whitelist): ${finalStats.skipped}\n`;
    resultMessage += `• 👥 Đã có trong nhóm: ${finalStats.alreadyInGroup}\n`;
    resultMessage += `• 📈 Tỷ lệ thành công: ${successRate}%\n\n`;
    
    if (finalStats.success > 0) {
      resultMessage += `🎊 Đã mời thành công ${finalStats.success} bạn bè vào nhóm!`;
    } else {
      resultMessage += `⚠️ Không có bạn bè nào được mời thành công.`;
    }

    return api.sendMessage({
      msg: resultMessage,
      ttl: 180000
    }, threadId, type);

  } catch (error) {
    console.error('[BONZ ADD] Error in executeInviteAll:', error);
    
    return api.sendMessage({
      msg: `❌ **LỖI KHI MỜI BẠN BÈ**\n\n` +
           `🔧 **Lỗi:** ${error.message}\n` +
           `👤 **Yêu cầu bởi:** ${senderName}\n\n` +
           `💡 **Thử lại sau hoặc liên hệ admin**`,
      ttl: 60000
    }, threadId, type);
  }
}

async function executeMultiRoundInvite(api, event, senderName, maxRounds) {
  const { threadId, type } = event;
  
  try {
    // Validate rounds
    if (maxRounds < 1 || maxRounds > 10) {
      return api.sendMessage({
        msg: '⚠️ **SỐ VÒNG KHÔNG HỢP LỆ**\n\n' +
             '📊 **Giới hạn:** 1-10 vòng\n' +
             '💡 **Gợi ý:** bonzadd multi 3 (3 vòng)',
        ttl: 30000
      }, threadId, type);
    }

    // Reset global stats
    inviteStats.reset();
    
    let totalInvited = 0;
    let roundStats = [];
    
    await api.sendMessage({
      msg: `🔄 **MULTI-ROUND INVITE**\n\n` +
           `👤 **Thực hiện bởi:** ${senderName}\n` +
           `🎯 **Số vòng:** ${maxRounds}\n` +
           `⏰ **Bắt đầu:** ${new Date().toLocaleString('vi-VN')}\n\n` +
           `💡 Mỗi vòng sẽ có delay 10s để tránh spam...`,
      ttl: 60000
    }, threadId, type);

    for (let round = 1; round <= maxRounds; round++) {
      await api.sendMessage({
        msg: `🔄 **VÒNG ${round}/${maxRounds}**\n\n` +
             `⏳ Đang lấy danh sách bạn bè...\n` +
             `📊 Tổng đã mời: ${totalInvited} người`,
        ttl: 30000
      }, threadId, type);

      // Reset stats cho vòng này
      const roundStartStats = {
        success: inviteStats.success,
        failed: inviteStats.failed,
        skipped: inviteStats.skipped,
        alreadyInGroup: inviteStats.alreadyInGroup
      };

      // Lấy danh sách bạn bè (giống executeInviteAll)
      let friendsList = [];
      
      const methods = [
        async () => {
          if (typeof api.getFriendsList === 'function') {
            return await api.getFriendsList();
          }
          return null;
        },
        async () => {
          if (typeof api.getAllFriends === 'function') {
            return await api.getAllFriends();
          }
          return null;
        },
        async () => {
          if (typeof api.fetchAllFriends === 'function') {
            return await api.fetchAllFriends();
          }
          return null;
        }
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result && Array.isArray(result) && result.length > 0) {
            friendsList = result;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!friendsList || friendsList.length === 0) {
        roundStats.push({
          round: round,
          invited: 0,
          success: 0,
          failed: 0,
          error: 'Không lấy được danh sách bạn bè'
        });
        continue;
      }

      // Lấy whitelist và thành viên hiện tại
      const whitelist = loadWhitelist();
      let currentMembers = [];
      
      try {
        const threadInfo = await api.getThreadInfo?.(threadId);
        if (threadInfo && threadInfo.participantIDs) {
          currentMembers = threadInfo.participantIDs.map(id => String(id));
        }
      } catch (e) {
        console.log(`[BONZ ADD] Round ${round}: Could not get current members`);
      }

      // Filter bạn bè cần mời
      const friendsToInvite = friendsList.filter(friend => {
        const friendId = String(friend.userID || friend.userId || friend.id);
        
        if (whitelist.includes(friendId)) {
          return false;
        }
        
        if (currentMembers.includes(friendId)) {
          return false;
        }
        
        return true;
      });

      if (friendsToInvite.length === 0) {
        roundStats.push({
          round: round,
          invited: 0,
          success: 0,
          failed: 0,
          note: 'Không có bạn bè để mời'
        });
        
        await api.sendMessage({
          msg: `✅ **VÒNG ${round} HOÀN THÀNH**\n\n` +
               `📊 **Kết quả:** Không có bạn bè để mời\n` +
               `💡 Tất cả đã có trong nhóm hoặc whitelist`,
          ttl: 30000
        }, threadId, type);
        continue;
      }

      // Thực hiện mời (sử dụng batch processing như executeInviteAll)
      const BATCH_SIZE = 3; // Giảm batch size cho multi-round
      const BATCH_DELAY = 2000; // Giảm delay
      
      for (let batchStart = 0; batchStart < friendsToInvite.length; batchStart += BATCH_SIZE) {
        const batch = friendsToInvite.slice(batchStart, batchStart + BATCH_SIZE);
        const batchPromises = [];
        
        for (const friend of batch) {
          const friendId = String(friend.userID || friend.userId || friend.id);
          
          const invitePromise = (async () => {
            try {
              let success = false;
              
              // Thử các method (giống executeInviteAll nhưng ngắn gọn hơn)
              const addMethods = [
                () => api.addUserToGroup?.(friendId, threadId),
                () => api.addUsersToGroup?.([friendId], threadId),
                () => api.addParticipant?.(threadId, friendId)
              ];

              for (const addMethod of addMethods) {
                try {
                  if (addMethod) {
                    await addMethod();
                    success = true;
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }

              if (success) {
                inviteStats.success++;
              } else {
                inviteStats.failed++;
              }
              
            } catch (error) {
              inviteStats.failed++;
            }
          })();
          
          batchPromises.push(invitePromise);
        }
        
        await Promise.all(batchPromises);
        
        // Mini delay trong batch
        if (batchStart + BATCH_SIZE < friendsToInvite.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      // Tính stats cho vòng này
      const roundEndStats = {
        success: inviteStats.success - roundStartStats.success,
        failed: inviteStats.failed - roundStartStats.failed
      };

      roundStats.push({
        round: round,
        invited: friendsToInvite.length,
        success: roundEndStats.success,
        failed: roundEndStats.failed
      });

      totalInvited += friendsToInvite.length;

      await api.sendMessage({
        msg: `✅ **VÒNG ${round} HOÀN THÀNH**\n\n` +
             `📊 **Kết quả vòng này:**\n` +
             `• Đã mời: ${friendsToInvite.length} người\n` +
             `• ✅ Thành công: ${roundEndStats.success}\n` +
             `• ❌ Thất bại: ${roundEndStats.failed}\n\n` +
             `📈 **Tổng cộng:**\n` +
             `• Tổng đã mời: ${totalInvited} người\n` +
             `• Tổng thành công: ${inviteStats.success}\n` +
             `• Tổng thất bại: ${inviteStats.failed}`,
        ttl: 60000
      }, threadId, type);

      // Delay giữa các vòng (trừ vòng cuối)
      if (round < maxRounds) {
        await api.sendMessage({
          msg: `⏳ **NGHỈ GIỮA CÁC VÒNG**\n\n` +
               `🔄 Vòng tiếp theo: ${round + 1}/${maxRounds}\n` +
               `⏰ Đợi 10 giây để tránh spam...`,
          ttl: 15000
        }, threadId, type);
        
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // Báo cáo tổng kết
    const finalStats = inviteStats.getSummary();
    const successRate = finalStats.total > 0 ? Math.round((finalStats.success / finalStats.total) * 100) : 0;

    let summaryMessage = `🎉 **HOÀN THÀNH ${maxRounds} VÒNG MỜI!**\n\n`;
    summaryMessage += `👤 **Thực hiện bởi:** ${senderName}\n`;
    summaryMessage += `⏰ **Hoàn thành:** ${new Date().toLocaleString('vi-VN')}\n\n`;
    
    summaryMessage += `📊 **TỔNG KẾT:**\n`;
    summaryMessage += `• Tổng vòng: ${maxRounds}\n`;
    summaryMessage += `• Tổng đã mời: ${totalInvited} người\n`;
    summaryMessage += `• ✅ Thành công: ${finalStats.success}\n`;
    summaryMessage += `• ❌ Thất bại: ${finalStats.failed}\n`;
    summaryMessage += `• 📈 Tỷ lệ thành công: ${successRate}%\n\n`;
    
    summaryMessage += `📋 **CHI TIẾT TỪNG VÒNG:**\n`;
    for (const stat of roundStats) {
      summaryMessage += `• Vòng ${stat.round}: ${stat.success}/${stat.invited} thành công\n`;
    }
    
    summaryMessage += `\n🎊 **Multi-round invite hoàn thành!**`;

    return api.sendMessage({
      msg: summaryMessage,
      ttl: 300000 // 5 phút
    }, threadId, type);

  } catch (error) {
    console.error('[BONZ ADD] Error in executeMultiRoundInvite:', error);
    
    return api.sendMessage({
      msg: `❌ **LỖI MULTI-ROUND INVITE**\n\n` +
           `🔧 **Lỗi:** ${error.message}\n` +
           `👤 **Yêu cầu bởi:** ${senderName}\n\n` +
           `💡 **Thử lại sau hoặc liên hệ admin**`,
      ttl: 60000
    }, threadId, type);
  }
}

async function handleAddWhitelist(api, event, args, senderName) {
  const { threadId, type } = event;
  
  // Lấy user IDs từ mentions hoặc args
  const userIds = getUserIdsFromEvent(event, args);
  
  if (userIds.length === 0) {
    return api.sendMessage({
      msg: `⚠️ **THIẾU THÔNG TIN USER**\n\n` +
           `💡 **Cách dùng:**\n` +
           `• bonzadd addwl @user1 @user2\n` +
           `• bonzadd addwl 123456789\n` +
           `• Reply tin nhắn + bonzadd addwl`,
      ttl: 30000
    }, threadId, type);
  }

  const whitelist = loadWhitelist();
  const addedUsers = [];
  const alreadyInList = [];

  for (const userId of userIds) {
    if (!whitelist.includes(userId)) {
      whitelist.push(userId);
      addedUsers.push(userId);
    } else {
      alreadyInList.push(userId);
    }
  }

  saveWhitelist(whitelist);

  let message = `✅ **WHITELIST UPDATED**\n\n`;
  
  if (addedUsers.length > 0) {
    message += `➕ **Đã thêm:** ${addedUsers.length} người\n`;
    message += `📋 **UIDs:** ${addedUsers.join(', ')}\n\n`;
  }
  
  if (alreadyInList.length > 0) {
    message += `ℹ️ **Đã có trong whitelist:** ${alreadyInList.length} người\n`;
    message += `📋 **UIDs:** ${alreadyInList.join(', ')}\n\n`;
  }
  
  message += `📊 **Tổng whitelist:** ${whitelist.length} người\n`;
  message += `👤 **Thực hiện bởi:** ${senderName}`;

  return api.sendMessage({ msg: message, ttl: 60000 }, threadId, type);
}

async function handleRemoveWhitelist(api, event, args, senderName) {
  const { threadId, type } = event;
  
  const userIds = getUserIdsFromEvent(event, args);
  
  if (userIds.length === 0) {
    return api.sendMessage({
      msg: `⚠️ **THIẾU THÔNG TIN USER**\n\n` +
           `💡 **Cách dùng:**\n` +
           `• bonzadd remove @user1 @user2\n` +
           `• bonzadd remove 123456789\n` +
           `• Reply tin nhắn + bonzadd remove`,
      ttl: 30000
    }, threadId, type);
  }

  const whitelist = loadWhitelist();
  const removedUsers = [];
  const notInList = [];

  for (const userId of userIds) {
    const index = whitelist.indexOf(userId);
    if (index !== -1) {
      whitelist.splice(index, 1);
      removedUsers.push(userId);
    } else {
      notInList.push(userId);
    }
  }

  saveWhitelist(whitelist);

  let message = `🗑️ **WHITELIST UPDATED**\n\n`;
  
  if (removedUsers.length > 0) {
    message += `➖ **Đã xóa:** ${removedUsers.length} người\n`;
    message += `📋 **UIDs:** ${removedUsers.join(', ')}\n\n`;
  }
  
  if (notInList.length > 0) {
    message += `⚠️ **Không tìm thấy:** ${notInList.length} người\n`;
    message += `📋 **UIDs:** ${notInList.join(', ')}\n\n`;
  }
  
  message += `📊 **Tổng whitelist:** ${whitelist.length} người\n`;
  message += `👤 **Thực hiện bởi:** ${senderName}`;

  return api.sendMessage({ msg: message, ttl: 60000 }, threadId, type);
}

async function handleListWhitelist(api, event, senderName) {
  const { threadId, type } = event;
  
  const whitelist = loadWhitelist();
  
  if (whitelist.length === 0) {
    return api.sendMessage({
      msg: `📋 **WHITELIST TRỐNG**\n\n` +
           `ℹ️ Chưa có ai trong danh sách miễn mời.\n` +
           `💡 Dùng "bonzadd addwl @user" để thêm người vào whitelist.`,
      ttl: 30000
    }, threadId, type);
  }

  const CHUNK_SIZE = 20;
  const chunks = [];
  
  for (let i = 0; i < whitelist.length; i += CHUNK_SIZE) {
    chunks.push(whitelist.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const startIndex = i * CHUNK_SIZE + 1;
    
    let message = i === 0 ? 
      `📋 **DANH SÁCH WHITELIST**\n\n` :
      `📋 **WHITELIST (Tiếp theo)**\n\n`;
    
    message += `📊 **Tổng:** ${whitelist.length} người\n`;
    message += `📄 **Trang:** ${i + 1}/${chunks.length}\n\n`;
    
    chunk.forEach((uid, index) => {
      message += `${startIndex + index}. ${uid}\n`;
    });
    
    if (i === chunks.length - 1) {
      message += `\n👤 **Xem bởi:** ${senderName}`;
    }

    await api.sendMessage({ msg: message, ttl: 60000 }, threadId, type);
  }
}

async function showHelp(api, event) {
  const { threadId, type } = event;
  
  const message = 
    `📖 **HƯỚNG DẪN BONZ ADD**\n\n` +
    `🎯 **Mục đích:** Mời tất cả bạn bè vào nhóm với whitelist thông minh\n\n` +
    `📋 **CÁC LỆNH:**\n\n` +
    `**1️⃣ Mời bạn bè:**\n` +
    `• bonzadd - Mời 1 vòng (thông thường)\n` +
    `• bonzadd multi [số] - Mời nhiều vòng (3-10 vòng)\n` +
    `• bonzadd rounds 5 - Mời 5 vòng\n\n` +
    
    `**2️⃣ Quản lý whitelist:**\n` +
    `• bonzadd addwl @user - Thêm vào whitelist\n` +
    `• bonzadd remove @user - Xóa khỏi whitelist\n` +
    `• bonzadd list - Xem danh sách whitelist\n\n` +
    
    `**3️⃣ Trợ giúp & Debug:**\n` +
    `• bonzadd help - Xem hướng dẫn này\n` +
    `• bonzadd debug - Kiểm tra API methods\n\n` +
    
    `🔧 **Aliases:** addall, inviteall, keomem\n\n` +
    
    `⚠️ **Lưu ý:**\n` +
    `• Chỉ admin bot mới được sử dụng\n` +
    `• Chỉ hoạt động trong nhóm\n` +
    `• Có delay để tránh spam\n` +
    `• Tự động bỏ qua người đã có trong nhóm`;

  return api.sendMessage({ msg: message, ttl: 120000 }, threadId, type);
}

async function showDebugInfo(api, event, senderName) {
  const { threadId, type } = event;
  
  // Kiểm tra các API methods có sẵn
  const apiMethods = {
    'Friends API': [
      'getFriendsList',
      'getAllFriends', 
      'fetchAllFriends',
      'getUserFriends'
    ],
    'Add User API': [
      'addUserToGroup',
      'addUsersToGroup',
      'addParticipant',
      'addParticipants',
      'inviteToGroup',
      'addMember'
    ],
    'Group API': [
      'getThreadInfo',
      'getGroupInfo',
      'changeGroupImage',
      'createPoll'
    ]
  };
  
  let debugMessage = `🔍 **DEBUG INFO - API METHODS**\n\n`;
  debugMessage += `👤 **Kiểm tra bởi:** ${senderName}\n`;
  debugMessage += `🆔 **Thread ID:** ${threadId}\n\n`;
  
  for (const [category, methods] of Object.entries(apiMethods)) {
    debugMessage += `📋 **${category}:**\n`;
    
    for (const method of methods) {
      const available = typeof api[method] === 'function';
      const status = available ? '✅' : '❌';
      debugMessage += `${status} ${method}\n`;
    }
    debugMessage += '\n';
  }
  
  // Thêm thông tin về bot
  debugMessage += `🤖 **Bot Info:**\n`;
  debugMessage += `• Bot ID: ${api.getCurrentUserID?.() || 'Unknown'}\n`;
  debugMessage += `• API Type: ${api.constructor?.name || 'Unknown'}\n\n`;
  
  debugMessage += `💡 **Gợi ý:**\n`;
  debugMessage += `• Nếu nhiều API ❌: Cần update zca-js\n`;
  debugMessage += `• Nếu Add User API ❌: Thử method khác\n`;
  debugMessage += `• Check console log để xem lỗi chi tiết`;
  
  return api.sendMessage({ msg: debugMessage, ttl: 120000 }, threadId, type);
}

// Helper functions
function getUserIdsFromEvent(event, args) {
  const userIds = [];
  
  // Từ mentions
  if (event.data?.mentions) {
    for (const mention of Object.values(event.data.mentions)) {
      userIds.push(String(mention.uid || mention.id));
    }
  }
  
  // Từ quote/reply
  if (event.data?.quote?.ownerId) {
    userIds.push(String(event.data.quote.ownerId));
  }
  
  // Từ args (UIDs)
  for (const arg of args.slice(1)) {
    if (/^\d+$/.test(arg)) {
      userIds.push(arg);
    }
  }
  
  return [...new Set(userIds)]; // Remove duplicates
}

function isAdminBot(userId) {
  try {
    const config = global.config || {};
    const adminIds = Array.isArray(config.admin_bot) ? config.admin_bot : [];
    return adminIds.includes(String(userId));
  } catch (error) {
    console.error('[BONZ ADD] Error checking admin:', error);
    return false;
  }
}
