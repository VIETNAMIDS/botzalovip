const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const TEMP_DIR = path.join(__dirname, '..', 'cache', 'creategroup');
const PHONE_REGEX = /^\d{9,11}$/;
const UID_REGEX = /^\d{12,}$/;
const MAX_MEMBERS = 40;

module.exports.config = {
  name: 'creategroup',
  aliases: ['mkgroup', 'newgroup'],
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Tạo nhóm Zalo mới (dla admin bot) bằng API createGroup của zca-js',
  category: 'Quản lý nhóm',
  usage: 'creategroup [--name "Tên nhóm"] [--avatar <url>] <uid/sđt/mention ...>\n' +
         'Ví dụ: creategroup --name "Team PR" 1234567890123 0987654321',
  cooldowns: 5,
  dependencies: { axios: '' }
};

function isBotAdmin(userId) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  return admins.includes(String(userId)) || owners.includes(String(userId));
}

function parseFlags(args = []) {
  const cleaned = [];
  let avatarUrl = null;
  let explicitName = null;

  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i];
    const eqIndex = raw.indexOf('=');
    const key = eqIndex !== -1 ? raw.slice(0, eqIndex) : raw;
    const valueInline = eqIndex !== -1 ? raw.slice(eqIndex + 1) : null;
    const lowerKey = key.toLowerCase();

    if (lowerKey === '--avatar' || lowerKey === '-a') {
      if (valueInline) {
        avatarUrl = valueInline;
      } else if (i + 1 < args.length) {
        avatarUrl = args[i + 1];
        i += 1;
      }
      continue;
    }

    if (lowerKey === '--name' || lowerKey === '-n') {
      if (valueInline) {
        explicitName = valueInline;
      } else if (i + 1 < args.length) {
        explicitName = args[i + 1];
        i += 1;
      }
      continue;
    }

    cleaned.push(raw);
  }

  return { cleanedArgs: cleaned, avatarUrl, explicitName };
}

function extractMembersFromArgs(cleanedArgs) {
  const joined = cleanedArgs.join(' ').trim();
  if (!joined) {
    return { groupName: null, tokens: [] };
  }

  const pipeIndex = joined.indexOf('|');

  if (pipeIndex !== -1) {
    const namePart = joined.slice(0, pipeIndex).trim();
    const memberPart = joined.slice(pipeIndex + 1).trim();
    const tokens = memberPart
      .split(/[\s,]+/)
      .map(token => token.trim())
      .filter(Boolean);
    return { groupName: namePart || null, tokens };
  }

  const tokens = joined
    .split(/[\s,]+/)
    .map(token => token.trim())
    .filter(Boolean);

  return { groupName: null, tokens };
}

function looksLikeMemberToken(token = '') {
  if (!token) return false;
  if (token.startsWith('@')) return true;
  if (/^uid:/i.test(token)) return true;
  if (/zalo\.me\//i.test(token)) return true;

  const digitsOnly = token.replace(/\D/g, '');
  if (!digitsOnly) return false;

  return PHONE_REGEX.test(digitsOnly) || UID_REGEX.test(digitsOnly);
}

function isMentionPlaceholder(token = '') {
  if (!token) return false;
  if (token.startsWith('@')) return true;
  if (token.startsWith('/@')) return true;
  return false;
}

function splitInlineName(tokens = []) {
  const remaining = [...tokens];
  const nameTokens = [];

  while (remaining.length) {
    const peek = remaining[0];
    if (looksLikeMemberToken(peek)) break;
    nameTokens.push(remaining.shift());
  }

  return {
    inlineName: nameTokens.length ? nameTokens.join(' ') : null,
    memberTokens: remaining
  };
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true }).catch(() => {});
}

async function downloadAvatar(url) {
  if (!url) return null;
  await ensureTempDir();
  const fileName = `avatar_${Date.now()}.jpg`;
  const filePath = path.join(TEMP_DIR, fileName);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  await fs.writeFile(filePath, response.data);
  return filePath;
}

async function resolveToken(api, token) {
  if (!token) return { error: 'Token trống' };

  if (/^uid:/i.test(token)) {
    const val = token.slice(4).trim();
    if (val) return { uid: val, note: `uid:${val}` };
    return { error: `Không đọc được UID từ "${token}"` };
  }

  const linkMatch = token.match(/zalo\.me\/(?:profile\/)?([0-9]+)/i);
  if (linkMatch) {
    return { uid: linkMatch[1], note: 'Từ link zalo.me' };
  }

  const digits = token.replace(/\D/g, '');
  if (!digits) {
    return { error: `Không nhận diện được "${token}"` };
  }

  if (PHONE_REGEX.test(digits)) {
    try {
      const info = await api.findUser(digits);
      if (info?.uid) {
        return { uid: info.uid, note: `SĐT ${digits}` };
      }
      return { error: `Không tìm thấy tài khoản cho SĐT ${digits}` };
    } catch (err) {
      return { error: `Lỗi tra SĐT ${digits}: ${err?.message || err}` };
    }
  }

  if (UID_REGEX.test(digits)) {
    return { uid: digits, note: 'ID trực tiếp' };
  }

  return { error: `Chuỗi "${token}" không phải ID/SĐT hợp lệ` };
}

function buildUsageMessage() {
  return [
    '❗ Cách dùng lệnh creategroup:',
    '• creategroup Tên Nhóm | uid1 uid2 uid3',
    '• creategroup --name "Team PR" --avatar https://i.imgur.com/xxx.jpg 1234567890123 0987654321',
    '• Có thể tag bạn bè trong tin nhắn để thêm nhanh.',
    '• Chỉ admin/owner bot mới được dùng.'
  ].join('\n');
}

async function getMemberDetails(api, ids, mentionEntries) {
  const mentionNameMap = new Map();
  mentionEntries.forEach((mention) => {
    if (!mention?.uid) return;
    const key = String(mention.uid);
    const tag = mention?.tag || mention?.name || null;
    if (tag) mentionNameMap.set(key, tag.replace(/^@/, ''));
  });

  const details = new Map();
  const pendingFetchIds = [];

  ids.forEach((id) => {
    if (mentionNameMap.has(id)) {
      details.set(id, mentionNameMap.get(id));
    } else {
      pendingFetchIds.push(id);
    }
  });

  await Promise.all(
    pendingFetchIds.map(async (uid) => {
      try {
        const info = await api.getUserInfo(uid);
        const displayName = info?.changed_profiles?.[uid]?.displayName;
        if (displayName) {
          details.set(uid, displayName);
        }
      } catch (_) {
        // ignore, fallback later
      }
    })
  );

  return ids.map((id) => ({
    id,
    name: details.get(id) || `UID: ${id}`
  }));
}

function formatMemberList(members) {
  if (!Array.isArray(members) || members.length === 0) return 'Không có';
  const lines = [];
  const mentions = [];
  let cursor = 0;

  members.forEach((member, index) => {
    const displayName = member.name || member.id || `UID ${member.id}`;
    const line = `${index + 1}. ${displayName}`;
    const nameStart = line.length - displayName.length;
    mentions.push({
      uid: member.id,
      pos: cursor + nameStart,
      len: displayName.length
    });
    lines.push(line);
    cursor += line.length + 1;
  });

  return {
    text: lines.join('\n'),
    mentions
  };
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return;
  }

  if (typeof api.createGroup !== 'function') {
    return api.sendMessage(
      '❌ API createGroup không khả dụng trên phiên bản bot hiện tại.',
      threadId,
      type
    );
  }

  const senderId = data?.uidFrom || event?.authorId;
  if (!isBotAdmin(senderId)) {
    return api.sendMessage('🚫 Lệnh này chỉ dành cho admin/owner bot.', threadId, type);
  }

  const { cleanedArgs, avatarUrl, explicitName } = parseFlags(args || []);
  const { groupName: pipeName, tokens } = extractMembersFromArgs(cleanedArgs);
  const { inlineName, memberTokens: rawMemberTokens } = splitInlineName(tokens);
  const mentionEntries = Array.isArray(data?.mentions) ? data.mentions : [];
  const mentionIds = new Set(
    mentionEntries
      .map(m => m?.uid)
      .filter(Boolean)
      .map(String)
  );

  const memberTokens = rawMemberTokens.filter(token => !isMentionPlaceholder(token));

  if (memberTokens.length === 0 && mentionIds.size === 0) {
    return api.sendMessage(buildUsageMessage(), threadId, type);
  }

  const resolvedIds = new Map(); // id -> note
  const resolutionErrors = [];

  mentionEntries.forEach((mention) => {
    if (mention?.uid) {
      resolvedIds.set(String(mention.uid), 'Tag trong tin nhắn');
    }
  });

  const skippedPlaceholders = rawMemberTokens.filter(token => isMentionPlaceholder(token));
  if (skippedPlaceholders.length) {
    skippedPlaceholders.forEach((token, index) => {
      const mappedUid = mentionEntries[index]?.uid;
      if (mappedUid) {
        resolvedIds.set(String(mappedUid), 'Tag trong tin nhắn');
      }
    });
  }

  for (const token of memberTokens) {
    const result = await resolveToken(api, token);
    if (result.uid) {
      resolvedIds.set(String(result.uid), result.note || 'Tham số');
    } else if (result.error) {
      resolutionErrors.push(`• ${result.error}`);
    }
  }

  const memberIds = Array.from(resolvedIds.keys());

  if (memberIds.length === 0) {
    const errorMsg = resolutionErrors.length
      ? `❌ Không có ID hợp lệ.\n${resolutionErrors.join('\n')}`
      : '❌ Bạn cần cung cấp ít nhất 1 UID hoặc số điện thoại.';
    return api.sendMessage(errorMsg, threadId, type);
  }

  let finalMembers = memberIds;
  let trimmedNotice = '';
  if (memberIds.length > MAX_MEMBERS) {
    finalMembers = memberIds.slice(0, MAX_MEMBERS);
    trimmedNotice = `⚠️ Danh sách quá dài, chỉ lấy ${MAX_MEMBERS} thành viên đầu tiên.`;
  }

  const finalName =
    explicitName ||
    pipeName ||
    inlineName ||
    `Nhóm của ${data?.dName || 'Admin'} - ${new Date().toLocaleTimeString('vi-VN')}`;

  let avatarPath = null;
  if (avatarUrl) {
    try {
      avatarPath = await downloadAvatar(avatarUrl);
    } catch (err) {
      resolutionErrors.push(`• Không tải được ảnh avatar: ${err?.message || err}`);
    }
  }

  try {
    const memberDetails = await getMemberDetails(api, finalMembers, mentionEntries);

    const response = await api.createGroup({
      name: finalName,
      members: finalMembers,
      avatarSource: avatarPath || undefined
    });

    const successList = response?.sucessMembers || response?.successMembers || [];
    const errorList = response?.errorMembers || [];

    const { text: memberListText, mentions: memberMentions } = formatMemberList(memberDetails);
    const lines = [
      '✅ Đã gửi yêu cầu tạo nhóm mới!',
      `🆔 Group ID: ${response?.groupId || 'Chưa rõ'}`,
      `🏷️ Tên nhóm: ${finalName}`,
      `👥 Thành viên gửi kèm (${finalMembers.length}):`
    ];

    if (successList.length) {
      lines.push(`✅ Thêm thành công: ${successList.join(', ')}`);
    }

    if (errorList.length) {
      lines.push(`⚠️ Không thêm được: ${errorList.join(', ')}`);
    }

    if (trimmedNotice) {
      lines.push(trimmedNotice);
    }

    let messageBody = lines.join('\n');
    let mentionsPayload = [];

    if (memberListText) {
      const prefixLength = messageBody.length + 1;
      messageBody = `${messageBody}\n${memberListText}`;
      mentionsPayload = memberMentions.map((m) => ({
        uid: m.uid,
        pos: prefixLength + m.pos,
        len: m.len
      }));
    }

    return api.sendMessage(
      {
        msg: messageBody,
        mentions: mentionsPayload
      },
      threadId,
      type
    );
  } catch (error) {
    console.error('[CREATEGROUP] Lỗi tạo nhóm:', error);
    const message = [
      '❌ Không thể tạo nhóm.',
      `• Lý do: ${error?.message || 'Không xác định'}`,
    ]
      .filter(Boolean)
      .join('\n');
    return api.sendMessage(message, threadId, type);
  } finally {
    if (avatarPath) {
      fs.unlink(avatarPath).catch(() => {});
    }
  }
};
