const fs = require('fs');
const path = require('path');
const { TextStyle } = require('zca-js');

const DEFAULT_TTL_SECONDS = 30;
const DEFAULT_TTL_MS = DEFAULT_TTL_SECONDS * 1000;
const cayRunning = new Map();

function appendDeleteNotice(message, ttlMs = DEFAULT_TTL_MS) {
  return `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttlMs / 1000)}s`;
}

function shouldStripStyles(error) {
  const code = error?.code || error?.statusCode;
  return code === 112 || code === 400;
}

async function sendMessageWithStyleFallback(api, payload, threadId, type) {
  try {
    await api.sendMessage(payload, threadId, type);
    return true;
  } catch (error) {
    if (payload?.styles && shouldStripStyles(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.styles;
      await api.sendMessage(fallbackPayload, threadId, type);
      return true;
    }
    throw error;
  }
}

async function sendWithAutoDelete(api, threadId, type, { message, attachments, mentions }, ttlMs = DEFAULT_TTL_MS) {
  const payload = { ttl: ttlMs };

  if (message) {
    const msgText = appendDeleteNotice(message, ttlMs);
    payload.msg = msgText;
    payload.styles = buildMultiColorStyle(msgText);
  }

  if (attachments?.length) {
    payload.attachments = attachments;
  }

  if (mentions?.length) {
    payload.mentions = mentions;
  }

  return sendMessageWithStyleFallback(api, payload, threadId, type);
}

function buildMultiColorStyle(text) {
  const cleanText = typeof text === 'string' ? text : String(text ?? '');
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;
  const totalLength = cleanText.length;
  const MAX_SEGMENTS = 12;
  const baseChunk = Math.max(1, Math.floor(totalLength / MAX_SEGMENTS));

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    let chunkSize;
    if (styles.length >= MAX_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }

    const st = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st });
    cursor += chunkSize;
  }

  return styles;
}

async function resolveDisplayName(api, uid) {
  if (!uid) {
    return 'Unknown';
  }

  try {
    const userInfo = await api.getUserInfo([uid]);
    return userInfo?.changed_profiles?.[uid]?.displayName || userInfo?.[uid]?.name || String(uid);
  } catch {
    return String(uid);
  }
}

function buildMentions(message, tag, uid) {
  if (!message || !tag) {
    return [];
  }

  const mentions = [];
  let searchIndex = 0;

  while (true) {
    const found = message.indexOf(tag, searchIndex);
    if (found === -1) {
      break;
    }

    mentions.push({
      uid,
      id: uid,
      tag,
      pos: found,
      len: tag.length,
      offset: found,
      length: tag.length
    });

    searchIndex = found + tag.length;
  }

  return mentions;
}

async function checkAdminPermission(api, event, userId) {
  try {
    const BOT_ADMINS = [];

    if (BOT_ADMINS.includes(userId)) {
      return true;
    }

    let adminIDs = [];

    try {
      const threadInfo = await api.getThreadInfo?.(event.threadId);
      if (threadInfo?.adminIDs) {
        adminIDs = threadInfo.adminIDs.map(admin =>
          typeof admin === 'string' ? admin : admin.id || admin.uid
        );
      }
    } catch {}

    if (adminIDs.includes(userId)) {
      return true;
    }

    return true;
  } catch {
    return true;
  }
}

async function handleCay({ api, event, args }) {
  const { threadId, type } = event || {};
  const threadKey = threadId ? String(threadId) : null;
  if (!threadKey) {
    console.log('[CAY] Missing threadId in event, aborting.');
    return;
  }
  const authorId = String(event?.data?.uidFrom || event?.authorId || '');

  const SKIP_ADMIN_CHECK = true;

  if (!SKIP_ADMIN_CHECK) {
    const isAdmin = await checkAdminPermission(api, event, authorId);
    if (!isAdmin) {
      return sendWithAutoDelete(api, threadId, type, {
        message: '❌ Quyền lồn biên giới! Chỉ admin mới được sử dụng lệnh này.'
      });
    }
  }

  const action = args[0]?.toLowerCase();

  if (action === 'stop') {
    const cayData = cayRunning.get(threadKey);
    if (!cayData || !cayData.isRunning) {
      return sendWithAutoDelete(api, threadId, type, {
        message: '⚠️ **Réo tên đã dừng lại.**'
      });
    }

    clearInterval(cayData.intervalId);
    cayRunning.delete(threadKey);

    let stopMentions = [];
    let stopMessage = '✅ Đã dừng réo tên.';
    if (cayData?.targetUid) {
      const targetName = await resolveDisplayName(api, cayData.targetUid);
      const mentionTag = `@${targetName}`;
      stopMessage = `✅ Đã dừng réo tên ${mentionTag}.`;
      stopMentions = buildMentions(stopMessage, mentionTag, cayData.targetUid);
    }

    return sendWithAutoDelete(api, threadId, type, {
      message: stopMessage,
      mentions: stopMentions
    });
  }

  if (action !== 'on') {
    return sendWithAutoDelete(api, threadId, type, {
      message:
        '📢 **HƯỚNG DẪN SỬ DỤNG CAY**\n\n' +
        '🔥 Cách dùng:\n' +
        '• cay on @user - Bắt đầu réo tên\n' +
        '• cay stop - Dừng réo tên\n\n' +
        '⚠️ Lưu ý: Chỉ admin mới được sử dụng!'
    });
  }

  console.log('=== DEBUG CAY ===');
  console.log('Event structure:', JSON.stringify(event, null, 2));

  let mentions = [];
  let targetUid = null;

  if (event?.data?.mentions && event.data.mentions.length > 0) {
    mentions = event.data.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
  } else if (event?.mentions && event.mentions.length > 0) {
    mentions = event.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
  } else if (event?.messageReply?.mentions && event.messageReply.mentions.length > 0) {
    mentions = event.messageReply.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
  }

  console.log('Target UID:', targetUid);
  console.log('======================');

  if (!targetUid) {
    return sendWithAutoDelete(api, threadId, type, {
      message:
        '❌ Tag con chó cần ửa! Vui lòng tag người cần réo tên.\n\n' +
        '💡 Cách dùng: cay on @tên_người_cần_spam'
    });
  }

  const existingCay = cayRunning.get(threadKey);
  if (existingCay && existingCay.isRunning) {
    let runningMentions = [];
    let runningMessage = "⚠️ Đã có réo tên đang chạy! Dùng 'cay stop' để dừng trước.";
    if (existingCay.targetUid) {
      const runningName = await resolveDisplayName(api, existingCay.targetUid);
      const runningTag = `@${runningName}`;
      runningMessage = `⚠️ Đã có réo tên đang chạy cho ${runningTag}! Dùng 'cay stop' để dừng trước.`;
      runningMentions = buildMentions(runningMessage, runningTag, existingCay.targetUid);
    }

    return sendWithAutoDelete(api, threadId, type, {
      message: runningMessage,
      mentions: runningMentions
    });
  }

  const targetName = await resolveDisplayName(api, targetUid);
  const mentionTag = `@${targetName}`;

  const numericArgs = args
    .map(a => parseInt(a, 10))
    .filter(n => Number.isInteger(n) && n > 0);
  const ttlSeconds = numericArgs.length > 0 ? numericArgs[numericArgs.length - 1] : DEFAULT_TTL_SECONDS;
  const ttlMs = ttlSeconds * 1000;

  let cayMessages = [];
  try {
    const filePath = path.join(__dirname, 'noidung.txt');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      cayMessages = content.split('\n').filter(line => line.trim() !== '');
    }
  } catch (e) {
    console.log('Error reading noidung.txt:', e.message);
  }

  if (cayMessages.length === 0) {
    cayMessages = ['Cay chưa bạn ơi'];
  }

  let messageIndex = 0;
  const intervalId = setInterval(async () => {
    try {
      const message = cayMessages[messageIndex % cayMessages.length];
      const messageWithMention = `${mentionTag} ${message}`;
      const mentionEntries = buildMentions(messageWithMention, mentionTag, targetUid);

      const payloadVariants = [
        { msg: messageWithMention },
        { body: messageWithMention },
        { text: messageWithMention },
        { message: messageWithMention }
      ].map(variant => {
        const payload = {
          ...variant,
          mentions: mentionEntries,
          ttl: ttlMs
        };
        const content = variant.msg || variant.body || variant.text || variant.message;
        if (content) {
          payload.styles = buildMultiColorStyle(content);
        }
        return payload;
      });

      let sent = false;

      for (const payload of payloadVariants) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries && !sent) {
          try {
            await sendMessageWithStyleFallback(api, payload, threadId, type);
            sent = true;
            break;
          } catch (e) {
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (sent) break;
      }

      if (!sent) {
        let retryCount = 0;
        const fallbackPayload = {
          msg: messageWithMention,
          mentions: mentionEntries,
          ttl: ttlMs,
          styles: buildMultiColorStyle(messageWithMention)
        };
        while (retryCount < 3 && !sent) {
          try {
            await sendMessageWithStyleFallback(api, fallbackPayload, threadId, type);
            sent = true;
          } catch (e) {
            retryCount++;
            if (retryCount < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }

      messageIndex++;
    } catch (e) {
      console.log(`[CAY] 💥 Critical error: ${e.message}`);
    }
  }, 2500);

  cayRunning.set(threadKey, {
    isRunning: true,
    intervalId,
    targetUid
  });

  const startMessage =
    `🔥 **BẮT ĐẦU SPAM + TAG LIÊN TỤC!**\n\n` +
    `🎯 Target: ${mentionTag}\n` +
    `📱 Tag: ${mentionTag} (mỗi tin nhắn)\n` +
    `⏰ Tần suất: 2.5 giây/lần\n` +
    `🧹 Tự xóa sau: ${ttlSeconds}s\n` +
    `📝 Số câu chửi: ${cayMessages.length}+\n` +
    `🔄 Tự động tag trong mỗi tin nhắn\n\n` +
    `⚠️ Dùng 'cay stop' để dừng!`;

  const startMentions = buildMentions(startMessage, mentionTag, targetUid);

  try {
    return await sendWithAutoDelete(api, threadId, type, {
      message: startMessage,
      mentions: startMentions
    }, ttlMs);
  } catch (e) {
    return sendWithAutoDelete(api, threadId, type, {
      message: startMessage
    }, ttlMs);
  }
}

module.exports = {
  config: {
    name: 'cay',
    version: '1.0.0',
    hasPermission: 0,
    credits: 'Cascade',
    description: 'Spam réo tên người được tag',
    commandCategory: 'Admin',
    usages: 'cay on @user | cay stop',
    cooldowns: 3
  },
  run: async function({ api, event, args }) {
    return handleCay({ api, event, args });
  }
};
