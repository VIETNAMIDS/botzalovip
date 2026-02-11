const { URL } = require('url');

module.exports.config = {
  name: 'bzjoin',
  version: '2.0.0',
  role: 1,
  author: 'Cascade & Bonz',
  description: 'Bot tham gia nhóm Zalo bằng link mời (Fixed)',
  category: 'Nhóm',
  usage: 'bzjoin <link_zalo>',
  cooldowns: 5
};

// Helper: Extract invite code from Zalo link
function extractInviteCode(link) {
  try {
    // Pattern 1: https://zalo.me/g/XXXXX
    let match = link.match(/zalo\.me\/g\/([a-zA-Z0-9]+)/i);
    if (match) return match[1];

    // Pattern 2: https://chat.zalo.me/join/XXXXX
    match = link.match(/chat\.zalo\.me\/join\/([a-zA-Z0-9]+)/i);
    if (match) return match[1];

    // Pattern 3: https://zalo.me/group/XXXXX
    match = link.match(/zalo\.me\/group\/([a-zA-Z0-9]+)/i);
    if (match) return match[1];

    // Pattern 4: Extract from URL path
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }

    return null;
  } catch (error) {
    console.error('[bzjoin] Error extracting code:', error.message);
    return null;
  }
}

// Helper: Try all possible API methods
async function tryAllJoinMethods(api, link, inviteCode) {
  const results = [];
  
  // Method 1: Direct link methods
  const linkMethods = [
    { name: 'addUserToGroup', fn: () => api.addUserToGroup?.(link) },
    { name: 'joinGroupByLink', fn: () => api.joinGroupByLink?.(link) },
    { name: 'joinGroup (link)', fn: () => api.joinGroup?.(link) },
    { name: 'joinChatByLink', fn: () => api.joinChatByLink?.(link) },
    { name: 'acceptInviteLink', fn: () => api.acceptInviteLink?.(link) },
    { name: 'joinGroupByInviteLink', fn: () => api.joinGroupByInviteLink?.(link) },
    { name: 'acceptGroupInviteLink', fn: () => api.acceptGroupInviteLink?.(link) },
  ];

  for (const method of linkMethods) {
    try {
      if (typeof method.fn === 'function') {
        const result = await method.fn();
        if (result !== undefined && result !== null) {
          results.push({ success: true, method: method.name, data: result });
          return results[0]; // Return immediately on first success
        }
      }
    } catch (error) {
      results.push({ 
        success: false, 
        method: method.name, 
        error: error.message || String(error) 
      });
    }
  }

  // Method 2: Try with invite code if available
  if (inviteCode) {
    const codeMethods = [
      { name: 'joinGroupByCode', fn: () => api.joinGroupByCode?.(inviteCode) },
      { name: 'joinGroup (code)', fn: () => api.joinGroup?.(inviteCode) },
      { name: 'acceptInvite (code)', fn: () => api.acceptInvite?.(inviteCode) },
      { name: 'acceptGroupInvite (code)', fn: () => api.acceptGroupInvite?.(inviteCode) },
      { name: 'joinGroupByInviteCode', fn: () => api.joinGroupByInviteCode?.(inviteCode) },
    ];

    for (const method of codeMethods) {
      try {
        if (typeof method.fn === 'function') {
          const result = await method.fn();
          if (result !== undefined && result !== null) {
            results.push({ success: true, method: method.name, data: result });
            return results[0]; // Return immediately on first success
          }
        }
      } catch (error) {
        results.push({ 
          success: false, 
          method: method.name, 
          error: error.message || String(error) 
        });
      }
    }
  }

  // Method 3: Try to get group ID first, then join
  try {
    let groupId = null;
    
    // Try to resolve group ID from link
    const resolvers = [
      { name: 'getIDsGroup', fn: () => api.getIDsGroup?.(link) },
      { name: 'resolveInviteLink', fn: () => api.resolveInviteLink?.(link) },
      { name: 'getGroupInfoFromLink', fn: () => api.getGroupInfoFromLink?.(link) },
      { name: 'getGroupInfo (link)', fn: () => api.getGroupInfo?.(link) },
    ];

    for (const resolver of resolvers) {
      try {
        if (typeof resolver.fn === 'function') {
          const result = await resolver.fn();
          if (result) {
            groupId = result.groupId || result.chatId || result.id || result.threadId;
            if (groupId) {
              console.log(`[bzjoin] Resolved group ID: ${groupId} using ${resolver.name}`);
              break;
            }
          }
        }
      } catch (error) {
        // Continue to next resolver
      }
    }

    // If we have group ID, try to join by ID
    if (groupId) {
      const idMethods = [
        { name: 'joinGroupById', fn: () => api.joinGroupById?.(groupId) },
        { name: 'joinChat', fn: () => api.joinChat?.(groupId) },
        { name: 'joinGroup (id)', fn: () => api.joinGroup?.(groupId) },
        { name: 'acceptInvite (id)', fn: () => api.acceptInvite?.(groupId) },
        { name: 'acceptGroupInvite (id)', fn: () => api.acceptGroupInvite?.(groupId) },
        { name: 'addParticipant', fn: () => api.addParticipant?.(groupId) },
      ];

      for (const method of idMethods) {
        try {
          if (typeof method.fn === 'function') {
            const result = await method.fn();
            if (result !== undefined && result !== null) {
              results.push({ 
                success: true, 
                method: method.name, 
                data: result,
                groupId 
              });
              return results[0]; // Return immediately on first success
            }
          }
        } catch (error) {
          results.push({ 
            success: false, 
            method: method.name, 
            error: error.message || String(error),
            groupId 
          });
        }
      }
    }
  } catch (error) {
    console.error('[bzjoin] Error in group ID resolution:', error.message);
  }

  // Method 4: Try object parameter methods
  const objectMethods = [
    { name: 'joinGroup (object)', fn: () => api.joinGroup?.({ link, inviteCode }) },
    { name: 'acceptInvite (object)', fn: () => api.acceptInvite?.({ link, code: inviteCode }) },
  ];

  for (const method of objectMethods) {
    try {
      if (typeof method.fn === 'function') {
        const result = await method.fn();
        if (result !== undefined && result !== null) {
          results.push({ success: true, method: method.name, data: result });
          return results[0]; // Return immediately on first success
        }
      }
    } catch (error) {
      results.push({ 
        success: false, 
        method: method.name, 
        error: error.message || String(error) 
      });
    }
  }

  return results.length > 0 ? results[0] : null;
}

async function handleJoinByLink(api, event, textArgs = []) {
  const { threadId, type, data } = event || {};
  
  // Extract link from arguments or message content
  const raw = (textArgs || []).join(' ').trim() || String(data?.content || '');
  
  // Match various Zalo group link formats
  const linkMatch = raw.match(/https?:\/\/(?:chat\.zalo\.me\/join|zalo\.me\/(?:g|group|s))\/[^\s]+/i);
  
  if (!linkMatch) {
    return api.sendMessage(
      '❌ Vui lòng cung cấp link mời nhóm Zalo hợp lệ!\n\n' +
      '📌 Các định dạng hỗ trợ:\n' +
      '• https://zalo.me/g/xxxxx\n' +
      '• https://chat.zalo.me/join/xxxxx\n' +
      '• https://zalo.me/group/xxxxx\n\n' +
      '💡 Sử dụng: bzjoin <link_mời>',
      threadId, 
      type
    );
  }

  const link = linkMatch[0];
  const inviteCode = extractInviteCode(link);

  // Send processing message
  await api.sendMessage('⏳ Đang xử lý yêu cầu tham gia nhóm...', threadId, type);

  try {
    // Try all available methods
    const result = await tryAllJoinMethods(api, link, inviteCode);

    if (result && result.success) {
      let successMsg = '✅ Đã gửi yêu cầu tham gia nhóm thành công!\n\n';
      successMsg += `🔧 Phương thức: ${result.method}\n`;
      if (result.groupId) {
        successMsg += `🆔 Group ID: ${result.groupId}\n`;
      }
      if (inviteCode) {
        successMsg += `🔑 Invite Code: ${inviteCode}\n`;
      }
      successMsg += '\n💡 Nếu là nhóm riêng tư, admin nhóm cần chấp thuận yêu cầu tham gia.';
      
      return api.sendMessage(successMsg, threadId, type);
    } else {
      // Failed - provide detailed error info
      let errorMsg = '❌ Không thể tham gia nhóm!\n\n';
      errorMsg += '📋 Đã thử các phương thức sau:\n';
      
      if (result) {
        errorMsg += `• ${result.method}: ${result.error || 'Không khả dụng'}\n`;
      }
      
      errorMsg += '\n💡 Có thể do:\n';
      errorMsg += '• Link mời không hợp lệ hoặc đã hết hạn\n';
      errorMsg += '• Bot đã ở trong nhóm\n';
      errorMsg += '• Nhóm đã đạt giới hạn thành viên\n';
      errorMsg += '• API chưa hỗ trợ tính năng này\n\n';
      
      if (inviteCode) {
        errorMsg += `🔑 Invite Code: ${inviteCode}\n`;
      }
      errorMsg += `🔗 Link: ${link}`;
      
      return api.sendMessage(errorMsg, threadId, type);
    }
  } catch (error) {
    console.error('[bzjoin] Fatal error:', error);
    return api.sendMessage(
      `❌ Lỗi khi xử lý: ${error.message || 'Lỗi không xác định'}\n\n` +
      `🔗 Link: ${link}\n` +
      `${inviteCode ? `🔑 Code: ${inviteCode}` : ''}`,
      threadId, 
      type
    );
  }
}

module.exports.run = async function({ api, event, args }) {
  return handleJoinByLink(api, event, args);
};

module.exports.handleJoinByLink = handleJoinByLink;