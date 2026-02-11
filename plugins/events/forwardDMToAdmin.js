module.exports.config = {
  name: 'forwardDMToAdmin',
  event_type: ['message'],
  version: '1.0.1',
  author: 'Cascade',
  description: 'Forward tin nhắn cá nhân về admin bot'
};

const { ThreadType } = require('zca-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEDUP_TTL_MS = 5 * 60 * 1000; // Tăng lên 5 phút
const CONTENT_THROTTLE_MS = 8 * 1000; // Không forward cùng nội dung trong vòng 8 giây

function ensureDedupStore() {
  if (!(global.__bonzForwardDmDedup instanceof Map)) {
    global.__bonzForwardDmDedup = new Map();
  }
  return global.__bonzForwardDmDedup;
}

function ensureContentThrottleStore() {
  if (!(global.__bonzForwardDmContentDedup instanceof Map)) {
    global.__bonzForwardDmContentDedup = new Map();
  }
  return global.__bonzForwardDmContentDedup;
}

function markAndCheckDuplicate(key) {
  if (!key) return false;
  const store = ensureDedupStore();
  const now = Date.now();

  // Cleanup expired entries
  for (const [k, at] of store.entries()) {
    if (!at || (now - at) > DEDUP_TTL_MS) store.delete(k);
  }

  if (store.has(key)) return true;
  store.set(key, now);
  return false;
}

function shouldThrottleContent(senderId, hash) {
  if (!senderId || !hash) return false;
  const store = ensureContentThrottleStore();
  const key = String(senderId);
  const now = Date.now();
  const record = store.get(key);
  if (record && record.hash === hash && (now - record.at) < CONTENT_THROTTLE_MS) {
    return true;
  }
  store.set(key, { hash, at: now });
  return false;
}

function getAdminIds() {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  return Array.from(new Set([...admins, ...owners, ...whitelist].filter(Boolean)));
}

function safeTextFromContent(rawContent) {
  if (typeof rawContent === 'string') return rawContent;
  if (rawContent == null) return '';
  if (typeof rawContent?.title === 'string') return rawContent.title;
  try {
    const s = JSON.stringify(rawContent);
    return typeof s === 'string' ? s : String(rawContent);
  } catch {
    return String(rawContent);
  }
}

function getDmRelayTargetId() {
  const store = global?.__bonzDmRelay;
  if (!store || store.enabled !== true) return null;
  const target = store?.targetId;
  if (!target) return null;
  const id = String(target).trim();
  return id ? id : null;
}

const dmRelayPath = path.join(__dirname, '..', '..', 'data', 'dm_relay.json');

function loadDmRelayStore() {
  try {
    if (!(global.__bonzDmRelay && typeof global.__bonzDmRelay === 'object')) {
      global.__bonzDmRelay = { enabled: false, targetId: null, setBy: null, setAt: null };
    }

    if (!fs.existsSync(dmRelayPath)) {
      global.__bonzDmRelay.enabled = false;
      global.__bonzDmRelay.targetId = null;
      return global.__bonzDmRelay;
    }

    const raw = fs.readFileSync(dmRelayPath, 'utf8');
    const parsed = JSON.parse(raw);
    global.__bonzDmRelay.enabled = Boolean(parsed?.enabled);
    global.__bonzDmRelay.targetId = parsed?.targetId ? String(parsed.targetId) : null;
    global.__bonzDmRelay.setBy = parsed?.setBy ? String(parsed.setBy) : null;
    global.__bonzDmRelay.setAt = typeof parsed?.setAt === 'number' ? parsed.setAt : null;
    return global.__bonzDmRelay;
  } catch {
    if (!(global.__bonzDmRelay && typeof global.__bonzDmRelay === 'object')) {
      global.__bonzDmRelay = { enabled: false, targetId: null, setBy: null, setAt: null };
    }
    global.__bonzDmRelay.enabled = false;
    global.__bonzDmRelay.targetId = null;
    return global.__bonzDmRelay;
  }
}

function fingerprintMessage({ senderId, content, hasAttachments }) {
  const normalized = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000);
  const s = `${senderId || ''}|${hasAttachments ? '1' : '0'}|${normalized}`;
  return crypto.createHash('sha1').update(s).digest('hex');
}

function formatHCMTime(tsMs) {
  const t = Number(tsMs);
  const safe = Number.isFinite(t) ? t : Date.now();
  try {
    return new Date(safe).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return new Date(safe).toLocaleString('vi-VN');
  }
}

function pickStickerDetail(detailList, stickerId) {
  if (!Array.isArray(detailList)) return null;
  const found = detailList.find((x) => String(x?.id) === String(stickerId));
  return found || detailList[0] || null;
}

module.exports.run = async ({ api, event, eventType }) => {
  try {
    // Kiểm tra event type
    if (eventType !== 'message') return;

    const { threadId, type, data } = event || {};

    // Chỉ xử lý tin nhắn cá nhân
    if (Number(type) !== Number(ThreadType.User)) return;

    // cahan: mặc định OFF (kể cả sau restart). Chỉ forward khi enabled=true
    const relayStore = loadDmRelayStore();
    if (!relayStore?.enabled) return;

    // Lấy ID người gửi
    const senderId = String(data?.uidFrom || event?.authorId || '').trim();
    if (!senderId) return;

    // Lấy bot ID
    const selfId = typeof api?.getCurrentUserID === 'function'
      ? String(api.getCurrentUserID()).trim()
      : (typeof global?.api?.getCurrentUserID === 'function' 
          ? String(global.api.getCurrentUserID()).trim() 
          : null);

    // BỎ QUA nếu là tin nhắn từ chính bot
    if (selfId && senderId === selfId) return;

    // Lấy danh sách admin
    const relayTargetId = getDmRelayTargetId();
    const adminIds = relayTargetId ? [relayTargetId] : [];
    if (!adminIds.length) return;

    // BỎ QUA nếu người gửi là admin
    if (adminIds.includes(senderId)) return;

    // Lấy nội dung tin nhắn
    const rawContent = data?.content;
    const content = safeTextFromContent(rawContent).trim();

    // Detect sticker message variants (SDK sometimes sends sticker without text/attachments)
    const stickerId = String(
      data?.stickerId ??
      data?.stickerID ??
      rawContent?.stickerId ??
      rawContent?.stickerID ??
      rawContent?.id ??
      ''
    ).trim();
    const isSticker = Boolean(
      stickerId ||
      data?.msgType === 'sticker' ||
      data?.type === 'sticker' ||
      rawContent?.type === 'sticker'
    );

    // Kiểm tra attachments
    const attachments = data?.attachments || data?.attachment || data?.att || null;
    const hasAttachments = Array.isArray(attachments) ? attachments.length > 0 : !!attachments;

    // BỎ QUA nếu không có nội dung và không có attachments và không phải sticker
    if (!content && !hasAttachments && !isSticker) return;

    // BỎ QUA nếu nội dung chính là payload forward (tránh loop/spam)
    const isForwardPayload =
      content.startsWith('📩 TIN NHẮN CÁ NHÂN') ||
      content.startsWith('👤 Người gửi:') ||
      (content.includes('🕒 Thời gian:') && content.includes('💬 Nội dung:'));
    if (isForwardPayload) return;

    // Dedup theo fingerprint nội dung theo time bucket (KHÔNG dựa msgId vì SDK có thể đổi msgId)
    // Dùng thời điểm nhận event tại local để tránh lệch ts giữa các event trùng nhau
    const nowMs = Date.now();
    const bucket = Math.floor(nowMs / 10000);
    const contentForFp = isSticker
      ? `${content || ''}\n[sticker:${stickerId || 'unknown'}]`
      : content;
    const fp = fingerprintMessage({ senderId, content: contentForFp, hasAttachments });

    // Throttle theo nội dung (cùng sender, cùng nội dung trong vài giây)
    if (shouldThrottleContent(senderId, fp)) return;

    const strongKey = `${fp}_${bucket}`;
    const key = `${senderId}_${strongKey}`;
    if (markAndCheckDuplicate(key)) return;
 

    // Lấy tên người gửi
    let senderName = data?.dName || data?.fromDName || '';
    if (!senderName) {
      try {
        const info = await api.getUserInfo(senderId);
        senderName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
      } catch {
        senderName = 'Người dùng';
      }
    }

    const rawTs = data?.ts ?? data?.timestamp ?? Date.now();
    const sentAt = formatHCMTime(rawTs);

    const preview = content.length > 1500 ? content.slice(0, 1500) + '…' : content;
    const forwardText = [
      `👤 Người gửi: ${senderName} (${senderId})`,
      `🕒 Thời gian: ${sentAt}`,
      `💬 Nội dung: ${preview || '[không có text]'}`,
      isSticker ? `🧩 Sticker: ${stickerId ? `ID ${stickerId}` : 'Có'}` : null,
      hasAttachments ? '📎 Đính kèm: Có' : null
    ].filter(Boolean).join('\n');

    // Forward đến admin
    const sentAdmins = new Set();
    for (const adminId of adminIds) {
      // Tránh gửi trùng lặp cho cùng 1 admin
      if (sentAdmins.has(adminId)) continue;
      
      try {
        await api.sendMessage(forwardText, adminId, ThreadType.User);

        if (
          isSticker &&
          stickerId &&
          typeof api?.getStickersDetail === 'function' &&
          typeof api?.sendSticker === 'function'
        ) {
          try {
            // Dedup riêng cho sticker-send (tránh trường hợp text đã dedup nhưng sticker vẫn bị gọi 2 lần)
            const stickerSendKey = `stickerSend_${adminId}_${senderId}_${fp}_${bucket}`;
            if (markAndCheckDuplicate(stickerSendKey)) {
              sentAdmins.add(adminId);
              continue;
            }

            const details = await api.getStickersDetail(Number(stickerId));
            const sticker = pickStickerDetail(details, stickerId);
            const stickerType = sticker?.type;
            const cateId = sticker?.cateId;
            if (typeof stickerType === 'number' && typeof cateId === 'number') {
              await api.sendSticker({ id: Number(stickerId), cateId, type: stickerType }, adminId, ThreadType.User);
            }
          } catch (e) {
          }
        }

        sentAdmins.add(adminId);
      } catch (err) {
        // Bỏ qua lỗi gửi tin nhắn
      }
    }
  } catch (err) {
    // Bỏ qua tất cả lỗi
  }
};