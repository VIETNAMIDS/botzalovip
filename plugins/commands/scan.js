const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const Threads = require('../../core/controller/controllerThreads');
const axios = require('axios');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'bonzscan');
const FONT_DIR = path.join(ASSETS_DIR, 'fonts');
const PAPER_TEXTURE = path.join(ASSETS_DIR, 'paper-texture.png');
const HEADER_FONT = path.join(FONT_DIR, 'PlayfairDisplay-Bold.ttf');
const BODY_FONT = path.join(FONT_DIR, 'Montserrat-SemiBold.ttf');
const TEMP_IMAGE_DIR = path.join(__dirname, '..', 'cache', 'bonzscan');
const POSTER_LIMIT = 12;
const AUTO_DELETE_TIME = 120000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function safeRegisterFont(filePath, family) {
  try {
    if (fs.existsSync(filePath)) {
      registerFont(filePath, { family });
    }
  } catch (error) {
    console.warn(`[BONZSCAN] Không thể load font ${family}:`, error?.message);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function ensureFileReady(filePath, retries = 6, waitMs = 150) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile() && stats.size > 0) {
        return true;
      }
    } catch (_) {}
    if (attempt < retries) {
      await delay(waitMs);
    }
  }
  return false;
}

async function sendWithAutoDelete(api, threadId, type, { message, attachments, mentions }, ttl = AUTO_DELETE_TIME) {
  const payload = { ttl };
  payload.msg = message && message.trim() ? message : ' ';
  if (attachments?.length) {
    payload.attachments = attachments;
  }
  if (mentions?.length) {
    payload.mentions = mentions;
  }
  await api.sendMessage(payload, threadId, type);
}

safeRegisterFont(HEADER_FONT, 'Playfair');
safeRegisterFont(BODY_FONT, 'Montserrat');
ensureDir(TEMP_IMAGE_DIR);

module.exports.config = {
  name: 'bonzscan',
  version: '1.4.1',
  role: 2,
  author: 'Cascade',
  description: 'Quét & liệt kê toàn bộ nhóm bot đang tham gia kèm ảnh Canva',
  category: 'Quản trị',
  usage: 'bonzscan [all|top <n>|page <trang> [số]] | bonzscan admin [page <trang> [số]] | bonzscan check [page <trang> [số]]',
  cooldowns: 10,
  aliases: ['scan', 'scangr', 'grscan']
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event.authorId || event.senderID || '');
  const senderName = data?.dName || 'Admin bot';

  if (!isAdminBot(senderId)) {
    return api.sendMessage({
      msg: '🔒 Chỉ admin bot mới được phép sử dụng lệnh bonzscan.',
      ttl: 40000
    }, threadId, type);
  }

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return;
  }

  const primaryArg = (args[0] || '').toLowerCase();

  // Menu command
  if (primaryArg === 'menu') {
    try {
      const menuImagePath = await exportMenuPoster(senderName);
      if (menuImagePath && fs.existsSync(menuImagePath)) {
        await api.sendMessage({
          msg: 'đây là ảnh của chủ nhân',
          attachments: [menuImagePath],
          ttl: 120000
        }, threadId, type);
        setTimeout(() => {
          try { fs.unlinkSync(menuImagePath); } catch {}
        }, 60000);
      } else {
        await api.sendMessage({
          msg: '❌ Không thể tạo menu poster.',
          ttl: 40000
        }, threadId, type);
      }
    } catch (error) {
      console.error('[BONZSCAN] Menu error:', error);
      await api.sendMessage({
        msg: `❌ Lỗi hiển thị menu: ${error.message}`,
        ttl: 40000
      }, threadId, type);
    }
    return;
  }

  async function handleAdminScan({ api, event, args, senderName }) {
    const { threadId, type } = event;
    const { botId, adminGroups } = await collectAdminGroupsBonzoutStyle(api);

    if (!botId) {
      return api.sendMessage({
        msg: '❌ Không xác định được Bot ID nên không thể lọc nhóm admin.',
        ttl: 40000
      }, threadId, type);
    }

    if (adminGroups.length === 0) {
      return api.sendMessage({
        msg: 'ℹ️ Bot không giữ quyền admin ở nhóm nào.',
        ttl: 40000
      }, threadId, type);
    }

    let page = 1;
    let pageSize = 10;
    const lowerArgs = args.map(arg => arg?.toLowerCase?.() || arg);
    const pageIdx = lowerArgs.indexOf('page');
    if (pageIdx !== -1) {
      const pageArg = parseInt(args[pageIdx + 1], 10);
      const sizeArg = parseInt(args[pageIdx + 2], 10);
      page = Number.isFinite(pageArg) && pageArg > 0 ? pageArg : 1;
      const rawSize = Number.isFinite(sizeArg) && sizeArg > 0 ? sizeArg : 10;
      pageSize = Math.min(rawSize, 50);
    }

    const totalPages = Math.max(1, Math.ceil(adminGroups.length / pageSize));
    if (page > totalPages) {
      return api.sendMessage({
        msg: `⚠️ Trang ${page}/${totalPages} không tồn tại.\n💡 Dùng: bonzscan admin page ${totalPages} ${pageSize}`,
        ttl: 40000
      }, threadId, type);
    }

    const startIndex = (page - 1) * pageSize;
    const pageItems = adminGroups.slice(startIndex, startIndex + pageSize);
    const summary = buildSummaryMessage(adminGroups, pageItems, senderName, {
      realCount: adminGroups.length,
      label: 'Nhóm bot là admin'
    }, {
      pagination: {
        page,
        totalPages,
        pageSize,
        totalItems: adminGroups.length,
        startIndex: startIndex + 1,
        endIndex: startIndex + pageItems.length
      },
      showAll: adminGroups.length === pageItems.length
    });

    const detailLines = pageItems.map((group, idx) => {
      const order = startIndex + idx + 1;
      const roleLabel = group.role === 'creator' ? 'Người tạo' : 'Quản trị viên';
      return [
        `${group.roleIcon || '🛡️'} ${order}. ${group.name}`,
        `   👥 ${formatMemberCount(group.members)} thành viên`,
        `   ⭐ Vai trò: ${roleLabel}`
      ].join('\n');
    }).join('\n\n');

    const finalMessage = [
      summary,
      '\n🛡️ **Chi tiết nhóm admin**',
      detailLines || 'Không có dữ liệu hiển thị.'
    ].join('\n');

    await enrichGroupAvatars(api, adminGroups);

    const posterMeta = {
      total: adminGroups.length,
      owner: senderName,
      sidebarAvatar: await fetchGroupAvatarUrl(api, threadId),
      pageInfo: {
        page,
        totalPages
      }
    };

    const imagePath = pageItems.length > 0
      ? await exportPoster(pageItems.slice(0, POSTER_LIMIT), posterMeta)
      : null;

    if (imagePath && fs.existsSync(imagePath)) {
      try {
        await api.sendMessage({
          msg: 'đây là ảnh của chủ nhân',
          attachments: [imagePath],
          ttl: 120000
        }, threadId, type);
      } catch (error) {
        console.error('[BONZSCAN] Không thể gửi poster admin:', error);
        await api.sendMessage({
          msg: `⚠️ Gửi poster admin thất bại: ${error.message}`,
          ttl: 40000
        }, threadId, type);
      } finally {
        setTimeout(() => {
          try { fs.unlinkSync(imagePath); } catch {}
        }, 60000);
      }
    }
  }

  async function handleCheckLeave({ api, event, args, senderName }) {
    const { threadId, type } = event;

    if (typeof api.getGroupInfo !== 'function') {
      return api.sendMessage({
        msg: '❌ API hiện không hỗ trợ getGroupInfo nên không thể kiểm tra khoá chat.',
        ttl: 40000
      }, threadId, type);
    }

    const { list: groups } = await collectGroupData(api);
    if (!groups.length) {
      return api.sendMessage({
        msg: '📭 Không tìm thấy nhóm nào để kiểm tra trạng thái khoá chat.',
        ttl: 40000
      }, threadId, type);
    }

    const lockedGroups = [];
    const errors = [];

    for (const group of groups) {
      const snapshot = await getGroupLockSnapshot(api, group.id);
      if (snapshot.error) {
        errors.push({ id: group.id, error: snapshot.error });
      } else if (snapshot.locked) {
        lockedGroups.push({
          ...group,
          lockReason: snapshot.reason,
          lockCheckedAt: snapshot.checkedAt,
          lockMeta: snapshot
        });
      }
      await delay(120);
    }

    if (!lockedGroups.length) {
      return api.sendMessage({
        msg: '✅ Không có nhóm nào đang khoá chat.',
        ttl: 40000
      }, threadId, type);
    }

    const sortedLocked = lockedGroups.sort((a, b) => {
      const memberDiff = (b.members || 0) - (a.members || 0);
      if (memberDiff !== 0) return memberDiff;
      return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
    });

    // Check if user provided a number to leave
    const leaveIndexArg = args[0];
    if (!leaveIndexArg || !/^\d+$/.test(leaveIndexArg)) {
      // Show list of locked groups for user to choose
      let listMsg = '🔐 **DANH SÁCH NHÓM KHOÁ CHAT**\n\n';
      listMsg += 'Gõ: bonzscan check leave [số] để rời nhóm\n\n';
      sortedLocked.forEach((group, idx) => {
        listMsg += `${idx + 1}. ${group.name}\n`;
        listMsg += `   👥 ${formatMemberCount(group.members)} thành viên\n`;
        listMsg += `   🔐 ID: ${group.id}\n\n`;
      });
      listMsg += `💡 Ví dụ: bonzscan check leave 1 (rời nhóm số 1)`;
      
      return api.sendMessage({
        msg: listMsg,
        ttl: 60000
      }, threadId, type);
    }

    // User selected a group to leave
    const selectedIndex = parseInt(leaveIndexArg, 10) - 1;
    
    if (selectedIndex < 0 || selectedIndex >= sortedLocked.length) {
      return api.sendMessage({
        msg: `❌ Số không hợp lệ. Vui lòng chọn từ 1 đến ${sortedLocked.length}.`,
        ttl: 40000
      }, threadId, type);
    }

    const selectedGroup = sortedLocked[selectedIndex];
    
    try {
      // Try different methods to leave the group
      let leftSuccessfully = false;
      
      // Method 1: Try leaveGroup
      if (typeof api.leaveGroup === 'function') {
        try {
          await api.leaveGroup(selectedGroup.id);
          leftSuccessfully = true;
        } catch (err1) {
          console.warn('[BONZSCAN] leaveGroup failed:', err1?.message);
        }
      }
      
      // Method 2: Try removeUser with bot ID
      if (!leftSuccessfully && typeof api.removeUser === 'function') {
        try {
          const botId = await getBotId(api);
          if (botId) {
            await api.removeUser(botId, selectedGroup.id);
            leftSuccessfully = true;
          }
        } catch (err2) {
          console.warn('[BONZSCAN] removeUser failed:', err2?.message);
        }
      }
      
      // Method 3: Try removeUserFromGroup
      if (!leftSuccessfully && typeof api.removeUserFromGroup === 'function') {
        try {
          const botId = await getBotId(api);
          if (botId) {
            await api.removeUserFromGroup(botId, selectedGroup.id);
            leftSuccessfully = true;
          }
        } catch (err3) {
          console.warn('[BONZSCAN] removeUserFromGroup failed:', err3?.message);
        }
      }
      
      if (leftSuccessfully) {
        await api.sendMessage({
          msg: `✅ Đã rời khỏi nhóm: ${selectedGroup.name}\n👥 ${formatMemberCount(selectedGroup.members)} thành viên\n🔐 ID: ${selectedGroup.id}`,
          ttl: 40000
        }, threadId, type);
      } else {
        await api.sendMessage({
          msg: `❌ Không tìm thấy API phù hợp để rời khỏi nhóm. Thử các phương thức: leaveGroup, removeUser, removeUserFromGroup`,
          ttl: 40000
        }, threadId, type);
      }
    } catch (error) {
      console.error('[BONZSCAN] Lỗi khi rời nhóm:', error);
      await api.sendMessage({
        msg: `❌ Không thể rời khỏi nhóm: ${error.message}`,
        ttl: 40000
      }, threadId, type);
    }
  }

  async function handleLockedScan({ api, event, args, senderName }) {
    const { threadId, type } = event;

    if (typeof api.getGroupInfo !== 'function') {
      return api.sendMessage({
        msg: '❌ API hiện không hỗ trợ getGroupInfo nên không thể kiểm tra khoá chat.',
        ttl: 40000
      }, threadId, type);
    }

    const { list: groups } = await collectGroupData(api);
    if (!groups.length) {
      return api.sendMessage({
        msg: '📭 Không tìm thấy nhóm nào để kiểm tra trạng thái khoá chat.',
        ttl: 40000
      }, threadId, type);
    }

    const lockedGroups = [];
    const errors = [];

    for (const group of groups) {
      const snapshot = await getGroupLockSnapshot(api, group.id);
      if (snapshot.error) {
        errors.push({ id: group.id, error: snapshot.error });
      } else if (snapshot.locked) {
        lockedGroups.push({
          ...group,
          lockReason: snapshot.reason,
          lockCheckedAt: snapshot.checkedAt,
          lockMeta: snapshot
        });
      }
      await delay(120);
    }

    if (!lockedGroups.length) {
      let msg = '✅ Không phát hiện nhóm nào đang khoá chat (lockSendMsg=1).';
      if (errors.length) {
        msg += `\n⚠️ ${errors.length} nhóm không kiểm tra được.`;
      }
      return api.sendMessage({ msg, ttl: 40000 }, threadId, type);
    }

    const sortedLocked = lockedGroups.sort((a, b) => {
      const memberDiff = (b.members || 0) - (a.members || 0);
      if (memberDiff !== 0) return memberDiff;
      return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
    });

    const lowerArgs = args.map(arg => typeof arg === 'string' ? arg.toLowerCase() : arg);
    let preferAll = lowerArgs.includes('all');
    let pagination = null;
    const pageIdx = lowerArgs.indexOf('page');
    if (pageIdx !== -1) {
      preferAll = false;
      const pageArg = parseInt(args[pageIdx + 1], 10);
      const sizeArg = parseInt(args[pageIdx + 2], 10);
      const page = Number.isFinite(pageArg) && pageArg > 0 ? pageArg : 1;
      const pageSizeRaw = Number.isFinite(sizeArg) && sizeArg > 0 ? sizeArg : 10;
      const pageSize = Math.min(pageSizeRaw, 50);
      pagination = { page, pageSize };
    }

    const previewCountArg = args.find((arg, idx) => {
      if (lowerArgs[idx] === 'page' || lowerArgs.includes('all')) return false;
      return /^\d+$/.test(arg);
    });

    let previewList = [];
    let pageInfo = null;

    if (preferAll) {
      previewList = sortedLocked;
    } else if (pagination) {
      const totalPages = Math.max(1, Math.ceil(sortedLocked.length / pagination.pageSize));
      if (pagination.page > totalPages) {
        return api.sendMessage({
          msg: `⚠️ Trang ${pagination.page}/${totalPages} không hợp lệ.\n💡 Dùng: bonzscan check page ${totalPages} ${pagination.pageSize}`,
          ttl: 40000
        }, threadId, type);
      }
      const startIndex = (pagination.page - 1) * pagination.pageSize;
      previewList = sortedLocked.slice(startIndex, startIndex + pagination.pageSize);
      pageInfo = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages,
        totalItems: sortedLocked.length,
        startIndex: startIndex + 1,
        endIndex: startIndex + previewList.length
      };
    } else {
      const previewCount = Math.min(Number(previewCountArg) || 10, sortedLocked.length);
      previewList = sortedLocked.slice(0, previewCount);
    }

    const summary = buildSummaryMessage(sortedLocked, previewList, senderName, {
      realCount: sortedLocked.length,
      label: 'Nhóm đang khoá chat'
    }, {
      pagination: pageInfo,
      showAll: preferAll
    });

    const detailStartIndex = pageInfo?.startIndex || 1;
    const detailLines = previewList.map((group, idx) => {
      const order = detailStartIndex + idx;
      const reason = group.lockReason || 'Đang bật khoá gửi tin (lockSendMsg=1)';
      const checked = group.lockCheckedAt
        ? new Date(group.lockCheckedAt).toLocaleString('vi-VN')
        : null;
      return [
        `🚫 ${order}. ${group.name}`,
        `   🔐 ID: ${group.id}`,
        `   📌 ${reason}`,
        checked ? `   ⏱ Kiểm tra: ${checked}` : null
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const finalMessage = [
      summary,
      '\n🚫 **Chi tiết nhóm khoá chat**',
      detailLines || 'Không có dữ liệu hiển thị.'
    ].join('\n');

    const posterMeta = {
      total: sortedLocked.length,
      owner: senderName,
      sidebarAvatar: await fetchGroupAvatarUrl(api, threadId),
      pageInfo
    };
    const topForPoster = previewList.slice(0, Math.min(POSTER_LIMIT, previewList.length));
    const imagePath = topForPoster.length
      ? await exportPoster(topForPoster, posterMeta)
      : null;

    const posterReady = imagePath && await ensureFileReady(imagePath, 8, 200);

    if (posterReady) {
      try {
        await sendWithAutoDelete(api, threadId, type, {
          message: 'đây là ảnh của chủ nhân',
          attachments: [imagePath]
        });
      } catch (error) {
        console.error('[BONZSCAN] Không thể gửi poster locked:', error);
        await sendWithAutoDelete(api, threadId, type, {
          message: `⚠️ Gửi poster khoá chat thất bại: ${error.message}`
        });
      } finally {
        setTimeout(() => {
          try { fs.unlinkSync(imagePath); } catch {}
        }, 60000);
      }
    } else {
      await sendWithAutoDelete(api, threadId, type, {
        message: '⚠️ Không thể tạo poster khoá chat.'
      });
    }

    if (errors.length) {
      console.warn(`[BONZSCAN] ${errors.length} nhóm không kiểm tra được trạng thái khoá chat.`);
    }
  }

  const waiting = await api.sendMessage({
    msg: '🔍 Đang quét dữ liệu nhóm, vui lòng đợi...',
    ttl: 30000
  }, threadId, type).catch(() => null);

  if (primaryArg === 'admin') {
    try {
      await handleAdminScan({ api, event, args: args.slice(1), senderName });
    } finally {
      if (waiting?.data?.msgId) {
        try {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: waiting.data.cliMsgId,
              msgId: waiting.data.msgId,
              uidFrom: waiting.data.uidFrom
            }
          }, false);
        } catch {}
      }
    }
    return;
  }

  if (primaryArg === 'check') {
    const subCommand = (args[1] || '').toLowerCase();
    if (subCommand === 'leave') {
      try {
        await handleCheckLeave({ api, event, args: args.slice(2), senderName });
      } finally {
        if (waiting?.data?.msgId) {
          try {
            await api.deleteMessage({
              threadId,
              type,
              data: {
                cliMsgId: waiting.data.cliMsgId,
                msgId: waiting.data.msgId,
                uidFrom: waiting.data.uidFrom
              }
            }, false);
          } catch {}
        }
      }
      return;
    }
    try {
      await handleLockedScan({ api, event, args: args.slice(1), senderName });
    } finally {
      if (waiting?.data?.msgId) {
        try {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: waiting.data.cliMsgId,
              msgId: waiting.data.msgId,
              uidFrom: waiting.data.uidFrom
            }
          }, false);
        } catch {}
      }
    }
    return;
  }

  try {
    const { list: groups, source } = await collectGroupData(api);
    if (!groups.length) {
      return api.sendMessage({
        msg: '📭 Không tìm thấy nhóm nào trong bộ nhớ bot. Hãy thử tương tác với một vài nhóm trước!',
        ttl: 40000
      }, threadId, type);
    }

    const lowerArgs = args.map(arg => typeof arg === 'string' ? arg.toLowerCase() : arg);
    let preferAll = lowerArgs.includes('all');

    const previewCountArg = args.find((arg, idx) => {
      if (lowerArgs[idx] === 'page' || lowerArgs.includes('all')) return false;
      return /^\d+$/.test(arg);
    });

    let pagination = null;
    const pageIdx = lowerArgs.indexOf('page');
    if (pageIdx !== -1) {
      preferAll = false;
      const pageArg = parseInt(args[pageIdx + 1], 10);
      const sizeArg = parseInt(args[pageIdx + 2], 10);
      const page = Number.isFinite(pageArg) && pageArg > 0 ? pageArg : 1;
      const pageSizeRaw = Number.isFinite(sizeArg) && sizeArg > 0 ? sizeArg : 10;
      const pageSize = Math.min(pageSizeRaw, 50);
      pagination = { page, pageSize };
    }

    let previewList = [];
    let pageInfo = null;

    if (preferAll) {
      previewList = groups;
    } else if (pagination) {
      const totalPages = Math.max(1, Math.ceil(groups.length / pagination.pageSize));
      if (pagination.page > totalPages) {
        return api.sendMessage({
          msg: `⚠️ Trang ${pagination.page}/${totalPages} không có dữ liệu.\n💡 Dùng "bonzscan page ${totalPages} ${pagination.pageSize}" để xem trang cuối.`,
          ttl: 40000
        }, threadId, type);
      }
      const startIndex = (pagination.page - 1) * pagination.pageSize;
      previewList = groups.slice(startIndex, startIndex + pagination.pageSize);
      pageInfo = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages,
        totalItems: groups.length,
        startIndex: startIndex + 1,
        endIndex: startIndex + previewList.length
      };
    } else {
      const previewCount = Math.min(Number(previewCountArg) || 10, groups.length);
      previewList = groups.slice(0, previewCount);
    }

    const posterSourceList = (preferAll || pagination) ? previewList : previewList;
    const topForPoster = posterSourceList.slice(0, Math.min(POSTER_LIMIT, posterSourceList.length));

    const summary = buildSummaryMessage(groups, previewList, senderName, source, {
      pagination: pageInfo,
      showAll: preferAll
    });
    const posterMeta = {
      total: groups.length,
      owner: senderName,
      sidebarAvatar: await fetchGroupAvatarUrl(api, threadId),
      pageInfo
    };
    const imagePath = topForPoster.length > 0
      ? await exportPoster(topForPoster, posterMeta)
      : null;

    if (imagePath && fs.existsSync(imagePath)) {
      try {
        await api.sendMessage({
          msg: 'đây là ảnh của chủ nhân',
          attachments: [imagePath],
          ttl: 120000
        }, threadId, type);
      } catch (streamError) {
        console.error('[BONZSCAN] Không thể gửi poster:', streamError);
        await api.sendMessage({
          msg: `⚠️ Gửi poster thất bại: ${streamError.message}`,
          ttl: 40000
        }, threadId, type);
      }
    }

    if (imagePath && fs.existsSync(imagePath)) {
      setTimeout(() => fs.unlink(imagePath, () => {}), 60_000);
    }
  } catch (error) {
    console.error('[BONZSCAN] run error:', error);
    await api.sendMessage({
      msg: `❌ Không thể quét danh sách nhóm: ${error.message}`,
      ttl: 40000
    }, threadId, type);
  } finally {
    if (waiting?.data?.msgId) {
      try {
        await api.deleteMessage({
          threadId,
          type,
          data: {
            cliMsgId: waiting.data.cliMsgId,
            msgId: waiting.data.msgId,
            uidFrom: waiting.data.uidFrom
          }
        }, false);
      } catch (_) {}
    }
  }
};

function isAdminBot(userId) {
  try {
    const config = global?.config || {};
    const admins = Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [];
    const owners = Array.isArray(config.owner_bot) ? config.owner_bot.map(String) : [];
    return admins.includes(String(userId)) || owners.includes(String(userId));
  } catch {
    return false;
  }
}

function buildSummaryMessage(groups, preview, senderName, source = {}, options = {}) {
  const totalMembers = groups.reduce((sum, g) => sum + (g.members || 0), 0);
  const avgMembers = groups.length ? Math.round(totalMembers / groups.length) : 0;
  const largest = groups[0];
  const smallest = groups[groups.length - 1];

  let message = '📊 **BONZ SCAN - THỐNG KÊ NHÓM**\n\n';
  const totalReal = source.realCount ?? groups.length;
  const dataLabel = source.label || 'Không xác định';
  message += `🔢 Tổng nhóm: ${totalReal}\n`;
  const currentPage = options.pagination?.page || 1;
  message += `📄 Trang ${currentPage} có: ${preview.length} nhóm\n`;
  message += `📡 Nguồn dữ liệu: ${dataLabel}\n`;
  message += `📈 Trung bình thành viên: ${avgMembers}\n`;
  if (largest) {
    message += `🏆 Nhóm đông nhất: ${largest.name} (${formatMemberCount(largest.members)} thành viên)\n`;
  }
  if (smallest && smallest !== largest) {
    message += `🌱 Nhóm nhỏ nhất: ${smallest.name} (${formatMemberCount(smallest.members)} thành viên)\n`;
  }

  if (options.pagination) {
    const { page, totalPages, pageSize, startIndex, endIndex, totalItems } = options.pagination;
    message += `\n📄 **Trang ${page}/${totalPages}** (hiển thị ${startIndex}-${endIndex}/ ${totalItems} nhóm, ${pageSize}/trang)\n`;
  } else if (!options.showAll) {
    message += `\n📄 Hiển thị ${preview.length}/${groups.length} nhóm (dùng "bonzscan all" hoặc "bonzscan page" để xem thêm)\n`;
  } else {
    message += `\n📄 Đang hiển thị toàn bộ ${preview.length} nhóm.\n`;
  }

  message += `\n📌 **Top ${preview.length} nhóm nổi bật:**\n`;
  preview.forEach((group, index) => {
    const rankIcon = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
    message += `${rankIcon} ${group.name}\n`;
    message += `   👤 ${formatMemberCount(group.members)} thành viên | ID ${group.id}\n`;
  });

  message += `\n🎨 Canva poster được tạo bởi ${senderName}.`;
  message += `\n💡 Dùng "bonzscan page 2 10" hoặc "bonzscan all" để đổi phạm vi.`;
  return message;
}

async function exportPoster(groups, meta) {
  try {
    const buffer = await renderGroupPoster(groups, meta);
    const filePath = path.join(TEMP_IMAGE_DIR, `bonzscan-${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (error) {
    console.warn('[BONZSCAN] Không thể render poster:', error?.message);
    return null;
  }
}

async function exportMenuPoster(senderName) {
  try {
    const buffer = await renderMenuPoster(senderName);
    const filePath = path.join(TEMP_IMAGE_DIR, `bonzscan-menu-${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (error) {
    console.warn('[BONZSCAN] Không thể render menu poster:', error?.message);
    return null;
  }
}

async function collectGroupData(api) {
  const groupMap = new Map();
  const shouldReplaceGroup = (current, incoming, override = false) => {
    if (!current) return true;
    if (override) return true;

    const currentName = String(current.name || '').trim();
    const incomingName = String(incoming.name || '').trim();
    const currentPlaceholder = isPlaceholderGroup({ name: currentName });
    const incomingPlaceholder = isPlaceholderGroup({ name: incomingName });

    if (currentPlaceholder && !incomingPlaceholder) return true;
    if (!currentPlaceholder && incomingPlaceholder) return false;

    if (incomingName && (!currentName || incomingName.length > currentName.length + 2)) {
      return true;
    }

    const currentMembers = Number(current.members) || 0;
    const incomingMembers = Number(incoming.members) || 0;
    if (incomingMembers > currentMembers && currentMembers === 0) return true;

    if (!current.avatar && incoming.avatar) return true;

    return false;
  };

  const upsert = (item, override = false) => {
    const shaped = shapeGroupEntry(item);
    if (!shaped?.id) return;
    const existing = groupMap.get(shaped.id);
    if (!existing || shouldReplaceGroup(existing, shaped, override)) {
      const merged = {
        ...existing,
        ...shaped,
        name: shouldReplaceGroup(existing, shaped, override) ? shaped.name : (existing?.name || shaped.name),
        members: (Number(shaped.members) || 0) > (Number(existing?.members) || 0) ? shaped.members : (existing?.members || shaped.members),
        avatar: existing?.avatar || shaped.avatar
      };
      groupMap.set(shaped.id, merged);
    }
  };

  const realGroups = await fetchRealGroupData(api);
  const sourceMeta = {
    realCount: realGroups.length,
    hasReal: realGroups.length > 0,
    label: ''
  };
  realGroups.forEach(group => upsert(group, true));

  try {
    const cached = Threads.getAll?.() || [];
    cached.forEach(entry => {
      const normalized = normalizeThreadEntry(entry);
      if (normalized) upsert(normalized);
    });
  } catch (error) {
    console.warn('[BONZSCAN] Không thể đọc cache Threads:', error?.message);
  }

  if (typeof api.getThreadList === 'function') {
    try {
      const list = await api.getThreadList(300, null, ['GROUP']);
      const threads = list?.threads || list?.data || list || [];
      const threadArray = Array.isArray(threads) ? threads : [];
      threadArray.forEach(thread => {
        const normalized = normalizeThreadEntry(thread);
        if (normalized) upsert(normalized);
      });
    } catch (error) {
      console.warn('[BONZSCAN] getThreadList lỗi:', error?.message);
    }
  }

  if (!groupMap.size && typeof api.getAllGroups === 'function') {
    try {
      const allGroups = await api.getAllGroups();
      const ids = Object.keys(allGroups?.gridVerMap || {});
      ids.forEach(id => upsert({ id, name: `Nhóm ${id}` }));
    } catch (error) {
      console.warn('[BONZSCAN] getAllGroups fallback lỗi:', error?.message);
    }
  }

  const groups = Array.from(groupMap.values());
  const sorted = groups.sort((a, b) => {
    const memberDiff = (b.members || 0) - (a.members || 0);
    if (memberDiff !== 0) return memberDiff;
    return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  });

  const cleaned = sorted.filter(group => !isPlaceholderGroup(group));
  let finalList = cleaned.length ? cleaned : sorted;

  const validIdList = finalList.filter(group => isValidGroupId(group?.id));
  if (validIdList.length) {
    finalList = validIdList;
  }

  if (!sourceMeta.hasReal || sourceMeta.realCount < sorted.length) {
    sourceMeta.realCount = sorted.length;
  }

  sourceMeta.label = sourceMeta.hasReal
    ? 'API getAllGroups / getGroupInfo'
    : groupMap.size
      ? 'Cache Threads + getThreadList'
      : 'Không có dữ liệu';

  await enrichGroupAvatars(api, finalList);

  return { list: finalList, source: { ...sourceMeta, totalAfterMerge: finalList.length } };
}

async function fetchRealGroupData(api) {
  if (typeof api.getAllGroups !== 'function') {
    return [];
  }

  const groups = [];

  try {
    const allGroups = await api.getAllGroups();
    const groupIds = Object.keys(allGroups?.gridVerMap || {});

    for (const groupId of groupIds) {
      try {
        let baseInfo = allGroups.gridVerMap?.[groupId];

        if ((!baseInfo || !baseInfo.name) && typeof api.getGroupInfo === 'function') {
          try {
            const detail = await api.getGroupInfo(groupId);
            // FIX: Lấy từ gridInfoMap theo cấu trúc GroupInfoResponse
            const gridInfoMap = detail?.gridInfoMap || detail?.data?.gridInfoMap || detail?.data?.data?.gridInfoMap;
            const gridInfo = gridInfoMap instanceof Map
              ? (gridInfoMap.get(String(groupId)) || gridInfoMap.get(Number(groupId)))
              : gridInfoMap?.[String(groupId)];
            baseInfo = gridInfo ||
              detail?.groupInfo?.[groupId] ||
              detail?.info ||
              detail;
          } catch (infoError) {
            baseInfo = baseInfo || {};
            baseInfo.error = infoError?.message;
          }
        }

        groups.push({
          id: groupId,
          name: baseInfo?.name || `Nhóm ${groupId.slice(-4)}`,
          members: baseInfo?.totalMember || baseInfo?.memberCount || baseInfo?.participantCount || 0,
          avatar: baseInfo?.avatar || baseInfo?.avt || baseInfo?.thumb || baseInfo?.image || baseInfo?.imageSrc || null,
          adminIds: baseInfo?.adminIds || [],
          creatorId: baseInfo?.creatorId || null,
          error: baseInfo?.error
        });
      } catch (error) {
        groups.push({
          id: groupId,
          name: `Nhóm ${groupId}`,
          members: 0,
          error: error?.message || String(error)
        });
      }

      if (groupIds.length > 30) {
        await delay(150);
      }
    }
  } catch (error) {
    console.warn('[BONZSCAN] fetchRealGroupData error:', error?.message);
  }

  return groups;
}

function normalizeThreadEntry(entry = {}) {
  const data = entry.data || entry.threadInfo || entry.info || entry;
  const info = data.threadInfo || data.info || {};
  const participantList =
    info.participantIDs ||
    data.participantIDs ||
    data.members ||
    info.members ||
    [];

  const memberCount = Array.isArray(participantList)
    ? participantList.length
    : (info.participantCount || data.participantCount || data.memberCount || 0);

  const rawName =
    info.threadName ||
    info.name ||
    data.threadName ||
    data.name ||
    entry.name ||
    null;

  const id =
    entry.threadId ||
    data.threadId ||
    info.threadId ||
    entry.id ||
    data.id ||
    null;

  if (!id) return null;

  // CRITICAL FIX: Loại bỏ mọi ký tự lỗi hiển thị
  let cleanName = rawName ? String(rawName)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim() : null;
  
  if (!cleanName) {
    cleanName = `Nhóm ${String(id).slice(-4)}`;
  }

  return {
    id: String(id),
    name: cleanName,
    members: Number(memberCount) || 0,
    avatar: info.imageSrc || data.imageSrc || info.avatar || info.avt || info.thumb || data.avatar || data.avt || data.thumb || null
  };
}

function shapeGroupEntry(raw = {}) {
  const id = raw.id ? String(raw.id) : null;
  if (!id) return null;
  
  // CRITICAL FIX: Loại bỏ mọi ký tự lỗi hiển thị
  let cleanName = raw.name ? String(raw.name)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim() : null;
  
  if (!cleanName) {
    cleanName = `Nhóm ${id.slice(-4)}`;
  }
  
  return {
    id,
    name: cleanName,
    members: Number(raw.members) || 0,
    avatar: raw.avatar || null,
    adminIds: Array.isArray(raw.adminIds) ? raw.adminIds : [],
    creatorId: raw.creatorId ? String(raw.creatorId) : null,
    error: raw.error
  };
}

function isPlaceholderGroup(group = {}) {
  const name = String(group.name || '').trim();
  if (!name) return true;
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!ascii) return true;
  if (/^nhom\s+\d{1,6}$/i.test(ascii)) {
    return true;
  }
  if (/^nhom\s+[0-9]+(\/[0-9]+)?$/i.test(ascii)) {
    return true;
  }
  if (/^group\s+\d+$/i.test(ascii)) {
    return true;
  }
  return false;
}

function isValidGroupId(groupId) {
  const gid = String(groupId || '').trim();
  if (!gid) return false;
  if (!/^\d+$/.test(gid)) return false;
  return gid.length >= 6;
}

function normalizeAvatarValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'object') {
    const candidates = [
      value.url,
      value.src,
      value.href,
      value.uri,
      value.link,
      value.image,
      value.imageUrl,
      value.imageURL,
      value.imageSrc,
      value.avatar,
      value.avatarUrl,
      value.avatarURL,
      value.thumb,
      value.thumbUrl,
      value.thumbURL,
      value.thumbnail,
      value.thumbnailUrl,
      value.large,
      value.largeUrl,
      value.hd,
      value.hdUrl,
      value.origin,
      value.originUrl,
      value.originURL
    ];
    for (const item of candidates) {
      const normalized = normalizeAvatarValue(item);
      if (normalized) return normalized;
    }
  }
  return null;
}

function pickAvatarFromObject(obj) {
  if (!obj) return null;
  const direct = [
    obj.avatar,
    obj.avt,
    obj.avatarUrl,
    obj.avatarURL,
    obj.imageSrc,
    obj.image,
    obj.imageUrl,
    obj.imageURL,
    obj.threadImage,
    obj.groupImage,
    obj.thumb,
    obj.thumbUrl,
    obj.thumbURL,
    obj.thumbnail,
    obj.thumbnailUrl
  ];
  for (const item of direct) {
    const normalized = normalizeAvatarValue(item);
    if (normalized) return normalized;
  }
  return null;
}

// FIX: Cải thiện hàm lấy avatar nhóm với nhiều nguồn dự phòng và log chi tiết
async function enrichGroupAvatars(api, groups) {
  if (!api) return;
  
  console.log(`[BONZSCAN] Bắt đầu lấy avatar cho ${groups.length} nhóm...`);
  
  for (const group of groups) {
    if (!isValidGroupId(group?.id)) {
      console.warn(`[BONZSCAN] Bỏ qua groupId không hợp lệ: ${group?.id}`);
      continue;
    }
    if (group.avatar) {
      console.log(`[BONZSCAN] ✓ Nhóm ${group.name} đã có avatar sẵn`);
      continue;
    }

    try {
      // Method 1: Dùng getGroupInfo với cấu trúc gridInfoMap
      if (typeof api.getGroupInfo === 'function') {
        try {
          const info = await api.getGroupInfo(group.id);
          
          // Lấy từ gridInfoMap theo cấu trúc GroupInfoResponse
          const gridInfoMap = info?.gridInfoMap || info?.data?.gridInfoMap || info?.data?.data?.gridInfoMap;
          const gridInfo = gridInfoMap instanceof Map
            ? (gridInfoMap.get(String(group.id)) || gridInfoMap.get(Number(group.id)))
            : gridInfoMap?.[String(group.id)];
          
          if (gridInfo) {
            const avatar = pickAvatarFromObject(gridInfo);
            
            if (avatar) {
              group.avatar = avatar;
              console.log(`[BONZSCAN] ✓ Lấy được avatar từ gridInfoMap cho nhóm ${group.name}: ${avatar.substring(0, 50)}...`);
              continue;
            }
          }
          
          // Fallback: thử các cấu trúc khác
          const detail = info?.groupInfo?.[group.id] || info?.info || info;
          const avatarFallback = pickAvatarFromObject(detail);
          
          if (avatarFallback) {
            group.avatar = avatarFallback;
            console.log(`[BONZSCAN] ✓ Lấy được avatar (fallback) cho nhóm ${group.name}: ${avatarFallback.substring(0, 50)}...`);
            continue;
          }
        } catch (err) {
          console.warn(`[BONZSCAN] getGroupInfo lỗi cho nhóm ${group.id}:`, err?.message);
        }
      }

      // Method 2: Dùng getThreadInfo
      if (typeof api.getThreadInfo === 'function') {
        try {
          const threadInfo = await api.getThreadInfo(group.id);
          const avatar = pickAvatarFromObject(threadInfo);
          
          if (avatar) {
            group.avatar = avatar;
            console.log(`[BONZSCAN] ✓ Lấy được avatar từ threadInfo cho nhóm ${group.name}: ${avatar.substring(0, 50)}...`);
            continue;
          }
        } catch (err) {
          console.warn(`[BONZSCAN] getThreadInfo lỗi cho nhóm ${group.id}:`, err?.message);
        }
      }

      // Method 3: Thử lấy từ graph.zalo.me (Zalo API)
      if (!group.avatar) {
        try {
          const graphUrl = `https://graph.zalo.me/v2.0/group/getinfo?id=${group.id}`;
          const response = await axios.get(graphUrl, {
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0'
            }
          }).catch(() => null);
          
          if (response?.data?.data?.avatar) {
            group.avatar = normalizeAvatarValue(response.data.data.avatar);
            console.log(`[BONZSCAN] ✓ Lấy được avatar từ Graph API cho nhóm ${group.name}: ${response.data.data.avatar.substring(0, 50)}...`);
            continue;
          }
        } catch (err) {
          console.warn(`[BONZSCAN] Graph API lỗi cho nhóm ${group.id}:`, err?.message);
        }
      }

    } catch (error) {
      console.warn(`[BONZSCAN] enrichGroupAvatars lỗi tổng thể cho nhóm ${group.id}:`, error?.message);
    }
    
    if (!group.avatar) {
      console.warn(`[BONZSCAN] ✗ Không lấy được avatar cho nhóm ${group.name} (ID: ${group.id})`);
    }
    
    await delay(150); // Tăng delay để tránh rate limit
  }
  
  const successCount = groups.filter(g => g.avatar).length;
  console.log(`[BONZSCAN] Hoàn thành: ${successCount}/${groups.length} nhóm có avatar`);
}

async function fetchGroupAvatarUrl(api, groupId) {
  if (!groupId || !api) return null;
  
  try {
    const gid = String(groupId);

    if (!isValidGroupId(gid)) {
      return null;
    }

    const getGridInfo = (info) => {
      const gridInfoMap = info?.gridInfoMap || info?.data?.gridInfoMap || info?.data?.data?.gridInfoMap;
      if (!gridInfoMap) return null;
      if (gridInfoMap instanceof Map) {
        return gridInfoMap.get(gid) || gridInfoMap.get(Number(gid)) || null;
      }
      return gridInfoMap?.[gid] || null;
    };
    
    // Method 1: getGroupInfo với gridInfoMap
    if (typeof api.getGroupInfo === 'function') {
      try {
        const info = await api.getGroupInfo(gid);
        
        // Lấy từ gridInfoMap theo cấu trúc GroupInfoResponse
        const gridInfo = getGridInfo(info);
        
        if (gridInfo) {
          const avatar = pickAvatarFromObject(gridInfo);
          
          if (avatar) {
            console.log(`[BONZSCAN] ✓ fetchGroupAvatarUrl: Lấy được avatar từ gridInfoMap`);
            return avatar;
          }
        }
        
        // Fallback
        const detail = info?.groupInfo?.[gid] || info?.info || info;
        const avatarFallback = pickAvatarFromObject(detail);
        
        if (avatarFallback) {
          console.log(`[BONZSCAN] ✓ fetchGroupAvatarUrl: Lấy được avatar (fallback)`);
          return avatarFallback;
        }
      } catch (err) {
        console.warn(`[BONZSCAN] fetchGroupAvatarUrl getGroupInfo lỗi:`, err?.message);
      }
    }

    // Method 2: getThreadInfo
    if (typeof api.getThreadInfo === 'function') {
      try {
        const threadInfo = await api.getThreadInfo(gid);
        const avatar = pickAvatarFromObject(threadInfo);
        
        if (avatar) {
          console.log(`[BONZSCAN] ✓ fetchGroupAvatarUrl: Lấy được avatar từ threadInfo`);
          return avatar;
        }
      } catch (err) {
        console.warn(`[BONZSCAN] fetchGroupAvatarUrl getThreadInfo lỗi:`, err?.message);
      }
    }

    // Method 3: Graph API
    try {
      const graphUrl = `https://graph.zalo.me/v2.0/group/getinfo?id=${gid}`;
      const response = await axios.get(graphUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      }).catch(() => null);
      
      if (response?.data?.data?.avatar) {
        console.log(`[BONZSCAN] ✓ fetchGroupAvatarUrl: Lấy được avatar từ Graph API`);
        return normalizeAvatarValue(response.data.data.avatar);
      }
    } catch (err) {
      console.warn(`[BONZSCAN] fetchGroupAvatarUrl Graph API lỗi:`, err?.message);
    }

  } catch (error) {
    console.warn(`[BONZSCAN] fetchGroupAvatarUrl lỗi tổng thể:`, error?.message);
  }
  
  console.warn(`[BONZSCAN] ✗ fetchGroupAvatarUrl: Không lấy được avatar cho group ${groupId}`);
  return null;
}

async function collectAdminGroupsBonzoutStyle(api) {
  const botId = await getBotId(api);
  if (!botId) {
    return { botId: null, adminGroups: [] };
  }

  const botIdStr = String(botId);
  const adminGroups = [];

  const appendGroup = (detail, groupId) => {
    if (!detail) return;
    const adminIds = (detail.adminIds || detail.admins || detail.adminList || []).map(String);
    const creatorId = detail.creatorId ? String(detail.creatorId) : null;
    const isCreator = creatorId === botIdStr;
    const isAdmin = adminIds.includes(botIdStr);
    if (!isCreator && !isAdmin) return;

    adminGroups.push({
      id: String(groupId),
      name: detail.name || `Nhóm ${String(groupId).slice(-4)}`,
      members: detail.totalMember || detail.memberCount || detail.participantCount || 0,
      role: isCreator ? 'creator' : 'admin',
      roleIcon: isCreator ? '👑' : '🛡️',
      avatar: detail.avatar || detail.avt || detail.thumb || detail.image || detail.imageSrc || null
    });
  };

  if (typeof api.getAllGroups === 'function') {
    try {
      const snapshot = await api.getAllGroups();
      const ids = Object.keys(snapshot?.gridVerMap || {});
      for (const groupId of ids) {
        let detail = snapshot.gridVerMap[groupId];
        if (!detail || !detail.adminIds) {
          try {
            const info = await api.getGroupInfo(groupId);
            // FIX: Lấy từ gridInfoMap
            const gridInfoMap = info?.gridInfoMap || info?.data?.gridInfoMap || info?.data?.data?.gridInfoMap;
            const gridInfo = gridInfoMap instanceof Map
              ? (gridInfoMap.get(String(groupId)) || gridInfoMap.get(Number(groupId)))
              : gridInfoMap?.[String(groupId)];
            detail = gridInfo ||
              info?.groupInfo?.[groupId] ||
              info?.info ||
              info;
          } catch (error) {
            console.warn('[BONZSCAN] Không thể lấy chi tiết nhóm khi kiểm tra admin:', error?.message);
          }
        }
        appendGroup(detail, groupId);
        await delay(120);
      }
    } catch (error) {
      console.warn('[BONZSCAN] getAllGroups khi lọc admin lỗi:', error?.message);
    }
  }

  if (!adminGroups.length) {
    const { list: groups } = await collectGroupData(api);
    groups.forEach(group => {
      appendGroup({
        name: group.name,
        totalMember: group.members,
        adminIds: group.adminIds,
        creatorId: group.creatorId,
        avatar: group.avatar
      }, group.id);
    });
  }

  await enrichGroupAvatars(api, adminGroups);

  return {
    botId: botIdStr,
    adminGroups
  };
}

async function getGroupLockSnapshot(api, groupId) {
  try {
    const info = await api.getGroupInfo(groupId);

    // FIX: Lấy từ gridInfoMap trước
    const gridInfoMap = info?.gridInfoMap || info?.data?.gridInfoMap || info?.data?.data?.gridInfoMap;
    const gridInfo = gridInfoMap instanceof Map
      ? (gridInfoMap.get(String(groupId)) || gridInfoMap.get(Number(groupId)))
      : gridInfoMap?.[String(groupId)];
    const detail = gridInfo ||
      info?.groupInfo?.[groupId] ||
      info?.info ||
      info;
    const setting = detail?.setting || detail?.settings || info?.setting || {};
    const locked = Number(setting.lockSendMsg) === 1;

    let reason = null;
    if (locked) {
      reason = setting.banReason ||
        setting.lockReason ||
        detail?.lockReason ||
        'Đang bật khoá gửi tin (lockSendMsg=1)';
    }

    return {
      locked,
      reason,
      settings: setting,
      checkedAt: Date.now()
    };
  } catch (error) {
    console.warn('[BONZSCAN] getGroupLockSnapshot error:', error?.message);
    return { error: error?.message || String(error) };
  }
}

async function getBotId(api) {
  try {
    if (global?.config?.bot_id) return String(global.config.bot_id);

    if (typeof api.getCurrentUserId === 'function') {
      const id = await api.getCurrentUserId();
      if (id) return String(id);
    }
  } catch {}
  return null;
}

// FIX: Cải thiện giao diện poster để giống ảnh mẫu
async function renderGroupPoster(groups, meta = {}) {
  const items = Array.isArray(groups) ? groups.slice(0, 12) : [];
  const columns = 2;
  const width = 1400;
  const height = 650; // Giảm từ 700 xuống 650
  const sidebarW = 300; // Giảm từ 320 xuống 300
  const outerPad = 24; // Giảm từ 28 xuống 24
  const panelPad = 20; // Giảm từ 26 xuống 20
  const gapX = 18; // Giảm từ 22 xuống 18
  const gapY = 14; // Giảm từ 18 xuống 14

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient - màu sắc giống ảnh mẫu
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#1a2332');
  bgGradient.addColorStop(0.3, '#1f3a2e');
  bgGradient.addColorStop(0.6, '#1e2838');
  bgGradient.addColorStop(1, '#2a1f3d');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative circles - làm mờ hơn
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(width * 0.78, height * 0.22, 380, 260, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.25, height * 0.84, 420, 300, 0, 0, Math.PI * 2);
  ctx.fill();

  const panelX = outerPad + sidebarW + outerPad;
  const panelY = outerPad;
  const panelW = width - panelX - outerPad;
  const panelH = height - outerPad * 2;

  // Sidebar - tối hơn
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, outerPad, outerPad, sidebarW, height - outerPad * 2, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();

  // Main panel - tối hơn
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, panelX, panelY, panelW, panelH, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  ctx.restore();

  // Avatar - Giảm kích thước để vừa sidebar
  const avatarSize = 240; // Giảm từ 260 xuống 240
  const avatarX = outerPad + (sidebarW - avatarSize) / 2;
  const avatarY = outerPad + 15; // Giảm từ 20 xuống 15
  const sidebarGroup = items[0];
  
  ctx.save();
  // Border vuông với bo góc nhẹ
  roundRect(ctx, avatarX - 6, avatarY - 6, avatarSize + 12, avatarSize + 12, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  
  // Avatar vuông thay vì tròn
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 14);
  ctx.clip();
  
  let drewSidebarAvatar = false;
  const sidebarAvatarUrl = meta?.sidebarAvatar || sidebarGroup?.avatar;
  
  if (sidebarAvatarUrl) {
    try {
      const img = await loadImage(sidebarAvatarUrl);
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      drewSidebarAvatar = true;
    } catch (err) {
      console.warn('[BONZSCAN] Không thể load sidebar avatar:', err?.message);
    }
  }

  if (!drewSidebarAvatar) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // MODIFIER button
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 20px Montserrat, sans-serif'; // Giảm từ 22px xuống 20px
  ctx.textAlign = 'center';
  const btnW = 200; // Giảm từ 220 xuống 200
  const btnH = 50; // Giảm từ 56 xuống 50
  const btnX = outerPad + (sidebarW - btnW) / 2;
  const btnY = height - outerPad - 60; // Giảm từ 70 xuống 60
  roundRect(ctx, btnX, btnY, btnW, btnH, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'middle';
  ctx.fillText('MODIFIER', btnX + btnW / 2, btnY + btnH / 2);

  // Header
  const headerX = panelX + panelPad;
  const headerY = panelY + 30; // Giảm từ 34 xuống 30
  const totalReal = meta.total ?? items.length;
  const pageInfo = meta.pageInfo;
  const headerRight = pageInfo ? `Trang ${pageInfo.page}/${pageInfo.totalPages}` : '';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.font = '700 30px Montserrat, sans-serif'; // Giảm từ 34px xuống 30px
  ctx.fillText('BonzScan', headerX, headerY);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '600 16px Montserrat, sans-serif'; // Giảm từ 18px xuống 16px
  ctx.fillText(`Tổng nhóm: ${totalReal}`, headerX, headerY + 24);

  if (headerRight) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.font = '600 16px Montserrat, sans-serif'; // Giảm từ 18px xuống 16px
    ctx.fillText(headerRight, panelX + panelW - panelPad, headerY + 10);
  }

  // Group cards
  const listTop = headerY + 56; // Giảm từ 64 xuống 56
  const listX = panelX + panelPad;
  const listW = panelW - panelPad * 2;
  const cardW = Math.floor((listW - gapX) / columns);
  const cardH = 95; // Giảm từ 110 xuống 95
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const maxVisible = Math.min(items.length, rows * columns);

  for (let index = 0; index < maxVisible; index++) {
    const group = items[index];
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = listX + col * (cardW + gapX);
    const y = listTop + row * (cardH + gapY);
    await drawGroupCard(ctx, {
      x,
      y,
      width: cardW,
      height: cardH,
      index,
      group
    });
  }

  return canvas.toBuffer('image/png');
}

async function drawGroupCard(ctx, options) {
  const { x, y, width, height, index, group } = options;

  // Card shadow - đậm hơn
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, width, height, 22);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();

  // Card border - sáng hơn
  roundRect(ctx, x, y, width, height, 22);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const pad = 14;
  const avt = 58;
  const avtX = x + pad;
  const avtY = y + Math.floor((height - avt) / 2);

  // Avatar
  ctx.save();
  roundRect(ctx, avtX, avtY, avt, avt, 16);
  ctx.clip();
  
  let drew = false;
  if (group?.avatar) {
    try {
      const img = await loadImage(group.avatar);
      ctx.drawImage(img, avtX, avtY, avt, avt);
      drew = true;
    } catch (err) {
      console.warn(`[BONZSCAN] Không thể load avatar nhóm ${group?.name}:`, err?.message);
    }
  }
  
  if (!drew) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(avtX, avtY, avt, avt);
  }
  ctx.restore();

  // Text
  const textX = avtX + avt + 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  
  // Màu xanh lá cho tên nhóm giống ảnh mẫu
  ctx.fillStyle = 'rgba(100, 255, 150, 0.95)';
  ctx.font = '700 18px Montserrat, sans-serif'; // Giảm từ 22px xuống 18px
  const rawName = String(group?.name || '').trim() || `Nhóm ${String(group?.id || '').slice(-4)}`;
  
  // CRITICAL FIX: Loại bỏ các ký tự không hiển thị được, emoji boxes
  const name = rawName
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width
    .replace(/[\uFFF0-\uFFFF]/g, '') // Special characters
    .replace(/[\u2600-\u27BF]/g, '') // Dingbats & symbols
    .replace(/[\uE000-\uF8FF]/g, '') // Private use area
    .replace(/[\uD800-\uDFFF]/g, '') // Surrogate pairs (emoji)
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Keep only printable chars
    .trim();
  
  const maxTextWidth = width - textX - 15;
  const nameLines = wrapText(ctx, name, maxTextWidth);
  
  // Hiển thị dòng 1 của tên nhóm
  if (nameLines.length > 0) {
    ctx.fillText(nameLines[0], textX, y + 28);
  }
  
  // Hiển thị dòng 2 nếu tên dài
  if (nameLines.length > 1) {
    ctx.font = '600 15px Montserrat, sans-serif'; // Giảm từ 18px xuống 15px
    ctx.fillText(nameLines[1], textX, y + 48);
  }

  // Màu tím cho ID giống ảnh mẫu - dịch xuống nếu có 2 dòng
  ctx.fillStyle = 'rgba(200, 180, 255, 0.80)';
  ctx.font = '600 12px Montserrat, sans-serif'; // Giảm từ 13px xuống 12px
  const idY = nameLines.length > 1 ? y + 68 : y + 55;
  ctx.fillText(String(group?.id || ''), textX, idY);

  // Index number
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = '700 14px Montserrat, sans-serif';
  ctx.fillText(String(index + 1), x + width - 14, y + height - 18);
}

function wrapText(ctx, text, maxWidth) {
  // CRITICAL FIX: Loại bỏ mọi ký tự đặc biệt có thể gây lỗi hiển thị
  const cleanText = String(text || '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
    .replace(/[\uFFF0-\uFFFF]/g, '') // Special characters
    .replace(/[\u2600-\u27BF]/g, '') // Dingbats & symbols
    .replace(/[\uE000-\uF8FF]/g, '') // Private use area
    .replace(/[\uD800-\uDFFF]/g, '') // Surrogate pairs (emoji boxes)
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Keep only printable
    .trim();
  
  if (!cleanText) return [];
  
  const words = cleanText.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function formatMemberCount(count) {
  const n = Number(count) || 0;
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return n.toString();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function renderMenuPoster(senderName) {
  const width = 1200;
  const height = 1800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(0.5, '#1e293b');
  bgGradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Paper texture
  if (fs.existsSync(PAPER_TEXTURE)) {
    try {
      const texture = await loadImage(PAPER_TEXTURE);
      const pattern = ctx.createPattern(texture, 'repeat');
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } catch (error) {
      console.warn('[BONZSCAN] Không thể load paper texture:', error?.message);
    }
  }

  // Decorative circles
  ctx.fillStyle = 'rgba(248, 250, 252, 0.08)';
  ctx.beginPath();
  ctx.ellipse(width - 100, 150, 200, 150, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(120, height - 150, 220, 180, 0, 0, Math.PI * 2);
  ctx.fill();

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 70px Playfair, serif';
  ctx.textAlign = 'center';
  ctx.fillText('📚 BONZ SCAN', width / 2, 90);

  ctx.font = '600 40px Montserrat, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('HƯỚNG DẪN SỬ DỤNG', width / 2, 150);

  const paddingX = 60;
  const paddingY = 200;
  const cardWidth = width - 120;
  const cardHeight = 120;
  const gapY = 20;
  let currentY = paddingY;

  const menuItems = [
    {
      icon: '🔍',
      title: 'bonzscan',
      desc: 'Quét toàn bộ nhóm bot đang tham gia',
      color: '#60a5fa'
    },
    {
      icon: '📄',
      title: 'bonzscan all',
      desc: 'Xem tất cả nhóm bot',
      color: '#34d399'
    },
    {
      icon: '📍',
      title: 'bonzscan page 2 10',
      desc: 'Xem trang 2 với 10 nhóm mỗi trang',
      color: '#fbbf24'
    },
    {
      icon: '👑',
      title: 'bonzscan admin',
      desc: 'Check nhóm mà bot đang làm admin',
      color: '#fb7185'
    },
    {
      icon: '👑',
      title: 'bonzscan admin page 2 10',
      desc: 'Check admin nhóm - xem trang 2',
      color: '#f472b6'
    },
    {
      icon: '🔐',
      title: 'bonzscan check',
      desc: 'Kiểm tra nhóm nào đang khoá chat',
      color: '#a78bfa'
    },
    {
      icon: '🔐',
      title: 'bonzscan check page 2 10',
      desc: 'Check nhóm khoá chat - xem trang 2',
      color: '#d946ef'
    },
    {
      icon: '🚪',
      title: 'bonzscan check leave 1',
      desc: 'Rời khỏi nhóm khoá chat số 1',
      color: '#ef4444'
    },
    {
      icon: '📋',
      title: 'bonzscan menu',
      desc: 'Hiển thị hướng dẫn này',
      color: '#06b6d4'
    }
  ];

  for (const item of menuItems) {
    // Card background
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, paddingX, currentY, cardWidth, cardHeight, 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fill();
    ctx.restore();

    // Gradient overlay
    const cardGradient = ctx.createLinearGradient(paddingX, currentY, paddingX + cardWidth, currentY + cardHeight);
    cardGradient.addColorStop(0, `${item.color}15`);
    cardGradient.addColorStop(1, `${item.color}05`);
    ctx.fillStyle = cardGradient;
    roundRect(ctx, paddingX, currentY, cardWidth, cardHeight, 20);
    ctx.fill();

    // Left colored bar
    ctx.fillStyle = item.color;
    roundRect(ctx, paddingX, currentY, 8, cardHeight, 20);
    ctx.fill();

    // Icon
    ctx.font = '700 50px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, paddingX + 25, currentY + cardHeight / 2);

    // Title
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 32px Montserrat, sans-serif';
    ctx.fillText(item.title, paddingX + 90, currentY + 35);

    // Description
    ctx.fillStyle = '#64748b';
    ctx.font = '500 26px Montserrat, sans-serif';
    ctx.fillText(item.desc, paddingX + 90, currentY + 75);

    currentY += cardHeight + gapY;
  }

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 24px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Tạo bởi ${senderName}`, width / 2, height - 40);
  ctx.fillText(new Date().toLocaleDateString('vi-VN'), width / 2, height - 10);

  return canvas.toBuffer('image/png');
}