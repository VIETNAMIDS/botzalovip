const handleCommand = require("./handle/handleCommand");
const handleEvent = require("./handle/handleEvent");
const logger = require("../utils/logger");
const { updateMessageCache } = require("../utils/index");
const chatgr = require("../utils/chatgr");
const blacklist = require("../utils/blacklist");
const { GroupEventType } = require("zca-js");

const Threads = require("./controller/controllerThreads");

function getNormalizedThreadId(event) {
  const threadId =
    event?.threadId ??
    event?.data?.threadId ??
    event?.data?.grid ??
    event?.data?.gridId;
  return threadId != null ? String(threadId) : null;
}

const bannedLogCooldownMs = 10_000;
const bannedLogLastAtByUser = new Map();

function shouldLogBannedUser(userId) {
  const id = userId != null ? String(userId) : "";
  if (!id) return false;
  const now = Date.now();
  const last = bannedLogLastAtByUser.get(id) || 0;
  if (now - last < bannedLogCooldownMs) return false;
  bannedLogLastAtByUser.set(id, now);
  return true;
}

const spamWindowMs = 5_000;
const spamMaxMessagesPerWindow = 20;
const spamBuckets = new Map();
let spamBucketsCleanupAt = 0;

const recalledTtlMs = 60 * 60 * 1000;
const recalledMessages = new Map();

function markRecalled(threadId, ids = []) {
  if (!threadId) return;
  const now = Date.now();
  for (const id of ids) {
    const s = id != null ? String(id).trim() : "";
    if (!s) continue;
    recalledMessages.set(`${threadId}:${s}`, now);
  }

  if (recalledMessages.size > 20_000) {
    const cutoff = now - recalledTtlMs;
    for (const [key, ts] of recalledMessages.entries()) {
      if (Number(ts) < cutoff) recalledMessages.delete(key);
    }
    if (recalledMessages.size > 20_000) {
      recalledMessages.clear();
    }
  }
}

function isRecalled(threadId, ids = []) {
  if (!threadId) return false;
  const now = Date.now();
  const cutoff = now - recalledTtlMs;
  for (const id of ids) {
    const s = id != null ? String(id).trim() : "";
    if (!s) continue;
    const key = `${threadId}:${s}`;
    const ts = recalledMessages.get(key);
    if (ts == null) continue;
    if (Number(ts) < cutoff) {
      recalledMessages.delete(key);
      continue;
    }
    return true;
  }
  return false;
}

function shouldRateLimit({ threadId, userId }) {
  if (!threadId || !userId) return false;
  const key = `${threadId}:${userId}`;
  const now = Date.now();

  if (now - spamBucketsCleanupAt > 60_000) {
    spamBucketsCleanupAt = now;
    if (spamBuckets.size > 5_000) spamBuckets.clear();
  }

  const bucket = spamBuckets.get(key);
  if (!bucket || now - bucket.startAt > spamWindowMs) {
    spamBuckets.set(key, { startAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (bucket.count > spamMaxMessagesPerWindow) return true;
  return false;
}

function startListening(api) {
  if (!api?.listener?.on || !api.listener.start) {
    logger.log("API listener không hợp lệ.", "error");
    return;
  }

  api.listener.on("message", async (event) => {
    try {
      // ===== BAN USER CHECK =====
      // Kiểm tra user có bị ban không
      const userId = event.data?.uidFrom || event.senderID;
      if (userId && blacklist.isBanned(userId)) {
        if (shouldLogBannedUser(userId)) {
          logger.log(`🚫 Blocked message from banned user: ${userId}`, "warn");
        }
        return;
      }
      // ===== END BAN USER CHECK =====

      const { data } = event;
      const rawContent = data?.content?.title ?? data?.content;
      const content = typeof rawContent === "string" ? rawContent.trim() : rawContent;
      const normalizedUserId = userId ? String(userId) : null;
      const isBotAdmin = normalizedUserId && Array.isArray(global.users?.admin)
        ? global.users.admin.includes(normalizedUserId)
        : false;
      const isBotSupport = normalizedUserId && Array.isArray(global.users?.support)
        ? global.users.support.includes(normalizedUserId)
        : false;

      const globalPrefix = global?.config?.prefix;
      const maybeText = typeof content === "string" ? content : "";
      const looksLikeCommand =
        (typeof globalPrefix === "string" && globalPrefix && maybeText.startsWith(globalPrefix)) ||
        maybeText.startsWith("!");

      if (!isBotAdmin && !isBotSupport && !looksLikeCommand) {
        const normalizedThreadId = getNormalizedThreadId(event);
        if (normalizedThreadId && normalizedUserId && shouldRateLimit({
          threadId: normalizedThreadId,
          userId: normalizedUserId
        })) {
          return;
        }
      }

      // ===== CHATGR FILTER =====
      const threadType = event.type;
      if (threadType === 1 && !isBotAdmin && !chatgr.shouldAllowThread(event.threadId, threadType)) {
        return;
      }
      // ===== END CHATGR FILTER =====

      updateMessageCache(event);

      // ===== EARLY COMMAND CHECK - CHỈ XỬ LÝ LỆNH =====
      const threadData = await Threads.getData(event.threadId).catch(() => null);
      const threadInfo = threadData?.data || {};
      const prefix = threadInfo.prefix ? threadInfo.prefix : global.config.prefix;
      
      // Kiểm tra chế độ command_only_mode
      const commandOnlyMode = global.config?.command_only_mode !== false;

      // Kiểm tra bot con trước (prefix !)
      let isCommand = false;
      if (typeof content === "string" && content.startsWith('!')) {
        isCommand = true;
        try {
          const sharebotCommand = require("../plugins/commands/sharebot");
          if (sharebotCommand.handleChildBot) {
            const handled = await sharebotCommand.handleChildBot(api, event);
            if (handled) return; // Đã xử lý bởi bot con
          }
        } catch (error) {
          // Bỏ qua lỗi nếu sharebot chưa có
        }
      }

      // Kiểm tra lệnh chính
      if (typeof content === "string" && content.startsWith(prefix)) {
        isCommand = true;
        const cmdBody = content.slice(prefix.length).trim();
        handleCommand(content, event, api, threadInfo, prefix);
      }

      // LUÔN XỬ LÝ EVENT (anti link, từ cấm, mute) - QUAN TRỌNG!
      handleEvent("message", event, api);

      // CHỈ LOG KHI LÀ LỆNH - THEO YÊU CẦU USER
      if (isCommand) {
        try {
          // Lấy tên nhóm và số thành viên từ API
          let groupName = "Unknown Group";
          let memberCount = 0;
          let isUserAdmin = false;
          try {
            if (event.type === 1) { // Group message
              const groupInfo = await api.getGroupInfo(event.threadId);
              
              groupName = groupInfo?.gridInfoMap?.[event.threadId]?.name || 
                         groupInfo?.name || 
                         threadInfo.name || 
                         "Unknown Group";
              
              // Lấy số thành viên và admin từ totalMember
              const groupData = groupInfo?.gridInfoMap?.[event.threadId];
              memberCount = groupData?.totalMember || 0;
              
              // Lấy danh sách admin và check user có phải admin không
              const adminIds = groupData?.adminIds || [];
              const creatorId = groupData?.creatorId;
              
              // Check admin: trong adminIds hoặc là creator
              isUserAdmin = adminIds.includes(event.data.uidFrom) || 
                           event.data.uidFrom === creatorId;
            } else {
              groupName = "Tin nhắn riêng";
              memberCount = 2; // Chỉ có 2 người trong tin nhắn riêng
              isUserAdmin = false; // Không có admin trong tin nhắn riêng
            }
          } catch (err) {
            groupName = threadInfo.name || "Unknown Group";
            memberCount = 0;
            isUserAdmin = false;
          }

          // Lấy tên người dùng
          let userName = "Unknown User";
          try {
            const userInfo = await api.getUserInfo(event.data.uidFrom);
            userName = userInfo?.changed_profiles?.[event.data.uidFrom]?.displayName || 
                      event.data.dName || 
                      event.data.uidFrom || 
                      "Unknown User";
          } catch (err) {
            userName = event.data.dName || event.data.uidFrom || "Unknown User";
          }

          const messageData = {
            groupName: groupName,
            groupId: event.threadId,
            userName: userName,
            content: content,
            timestamp: new Date().toLocaleTimeString('vi-VN'),
            memberCount: memberCount,
            isUserAdmin: isUserAdmin
          };
          
          // Chỉ hiển thị khung khi là lệnh
          logger.logMessage(messageData);
        } catch (logErr) {
          logger.log(`[ERROR] Lỗi log command: ${logErr.message}`, "error");
        }
      }
      
    } catch (err) {
      logger.log(`Lỗi xử lý message: ${err?.message || err}`, "error");
    }
  });


  api.listener.on("group_event", (event) => {
    try {
      const normalizedThreadId = getNormalizedThreadId(event);
      const senderId = event?.data?.uidFrom ?? event?.senderID;
      const normalizedUserId = senderId != null ? String(senderId) : null;
      const isBotAdmin = normalizedUserId && Array.isArray(global.users?.admin)
        ? global.users.admin.includes(normalizedUserId)
        : false;

      const groupEventType = event?.type;
      const isCriticalGroupEvent =
        groupEventType === GroupEventType.JOIN ||
        groupEventType === GroupEventType.UPDATE_SETTING ||
        groupEventType === GroupEventType.UPDATE;

      if (!isCriticalGroupEvent && normalizedThreadId && !isBotAdmin && !chatgr.shouldAllowThread(normalizedThreadId, 1)) {
        return;
      }

      if (normalizedThreadId) {
        Threads.getData(normalizedThreadId)
          .then((threadData) => {
            const info = threadData?.data || {};
            if (info.group_event_off === true) return;
            handleEvent("group_event", event, api);
          })
          .catch(() => {
            handleEvent("group_event", event, api);
          });
        return;
      }

      handleEvent("group_event", event, api);
    } catch (err) {
      logger.log(`Lỗi xử lý group_event: ${err?.message || err}`, "error");
    }
  });

  api.listener.on("reaction", (event) => {
    try {
      const normalizedThreadId = getNormalizedThreadId(event);
      const senderId = event?.data?.uidFrom ?? event?.senderID ?? event?.data?.userId;
      const normalizedUserId = senderId != null ? String(senderId) : null;
      const isBotAdmin = normalizedUserId && Array.isArray(global.users?.admin)
        ? global.users.admin.includes(normalizedUserId)
        : false;

      if (normalizedThreadId && !isBotAdmin && !chatgr.shouldAllowThread(normalizedThreadId, 1)) {
        return;
      }

      const msgId = event?.data?.msgId ?? event?.data?.messageId;
      const cliMsgId = event?.data?.cliMsgId ?? event?.data?.cMsgId;
      if (normalizedThreadId && isRecalled(normalizedThreadId, [msgId, cliMsgId])) {
        return;
      }
      handleEvent("reaction", event, api);
    } catch (err) {
      logger.log(`Lỗi xử lý reaction: ${err?.message || err}`, "error");
    }
  });

  api.listener.on("undo", (event) => {
    try {
      const normalizedThreadId = getNormalizedThreadId(event);
      const senderId = event?.data?.uidFrom ?? event?.senderID;
      const normalizedUserId = senderId != null ? String(senderId) : null;
      const isBotAdmin = normalizedUserId && Array.isArray(global.users?.admin)
        ? global.users.admin.includes(normalizedUserId)
        : false;

      if (normalizedThreadId && !isBotAdmin && !chatgr.shouldAllowThread(normalizedThreadId, 1)) {
        return;
      }

      if (normalizedThreadId) {
        const msgId = event?.data?.msgId ?? event?.data?.messageId;
        const cliMsgId = event?.data?.cliMsgId ?? event?.data?.cMsgId;
        markRecalled(normalizedThreadId, [msgId, cliMsgId]);
      }
      handleEvent("undo", event, api);
    } catch (err) {
      logger.log(`Lỗi xử lý undo: ${err?.message || err}`, "error");
    }
  });

  api.listener.start();
  logger.log("Đã bắt đầu lắng nghe sự kiện", "info");
}

module.exports = startListening;
