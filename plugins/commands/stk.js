const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const TEMP_DIR = path.join(__dirname, 'cache', 'sticker');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports.config = {
  name: 'stk',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo sticker (stk ddi) từ ảnh reply',
  category: 'Tiện ích',
  usage: 'stk ddi (reply ảnh)',
  cooldowns: 5,
};

function safeJson(value, limit = 900) {
  try {
    const s = JSON.stringify(value);
    if (typeof s !== 'string') return '';
    return s.length > limit ? s.slice(0, limit) + '…' : s;
  } catch {
    return '';
  }
}

function findImageUrlsDeep(root, { max = 10 } = {}) {
  const out = [];
  const seen = new Set();

  function pushUrl(s) {
    if (out.length >= max) return;
    const str = String(s || '');
    if (!/^https?:\/\//i.test(str)) return;
    if (!/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(str)) return;
    if (out.includes(str)) return;
    out.push(str);
  }

  function walk(obj, depth = 0) {
    if (out.length >= max) return;
    if (obj == null) return;
    if (depth > 7) return;

    if (typeof obj === 'string') {
      pushUrl(obj);
      return;
    }
    if (typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (const v of obj) walk(v, depth + 1);
      return;
    }

    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') pushUrl(v);
      else walk(v, depth + 1);
      if (out.length >= max) return;
    }
  }

  walk(root, 0);
  return out;
}

function buildDebugInfo(event) {
  const urls = findImageUrlsDeep(event, { max: 8 });
  const dataKeys = event?.data && typeof event.data === 'object' ? Object.keys(event.data).slice(0, 40) : [];
  const propKeys = event?.data?.propertyExt && typeof event.data.propertyExt === 'object' ? Object.keys(event.data.propertyExt).slice(0, 40) : [];

  const quote = event?.data?.quote || event?.data?.propertyExt?.quote || null;
  const quoteKeys = quote && typeof quote === 'object' ? Object.keys(quote).slice(0, 40) : [];

  const quoteMsgId = quote?.msgId || quote?.globalMsgId || quote?.messageId || null;
  const quoteCli = quote?.cliMsgId || quote?.clientMsgId || quote?.cliMsgID || null;

  const lines = [];
  lines.push('🧪 STK DEBUG');
  lines.push(`- urls_found: ${urls.length}`);
  if (urls.length) lines.push(`- first_url: ${urls[0]}`);
  lines.push(`- event.data keys: ${dataKeys.join(', ') || '(none)'}`);
  lines.push(`- propertyExt keys: ${propKeys.join(', ') || '(none)'}`);
  lines.push(`- quote keys: ${quoteKeys.join(', ') || '(none)'}`);
  lines.push(`- quote.msgId: ${quoteMsgId != null ? String(quoteMsgId) : '(none)'}`);
  lines.push(`- quote.cliMsgId: ${quoteCli != null ? String(quoteCli) : '(none)'}`);
  lines.push(`- messageReply: ${event?.messageReply ? 'yes' : 'no'}`);
  lines.push(`- repliedMessage: ${event?.repliedMessage ? 'yes' : 'no'}`);
  const preview = safeJson(event?.data?.propertyExt?.attachments || event?.data?.attachments || quote?.attachments || quote?.propertyExt?.attachments, 700);
  if (preview) lines.push(`- attachments_preview: ${preview}`);
  return lines.join('\n');
}

async function fetchQuotedMessageAttachments({ api, threadId, quoteMsgId, quoteCliMsgId }) {
  try {
    if (!api || !threadId) return null;
    const wantMsgId = quoteMsgId != null ? String(quoteMsgId) : null;
    const wantCli = quoteCliMsgId != null ? String(quoteCliMsgId) : null;
    if (!wantMsgId && !wantCli) return null;

    let messages = null;
    if (typeof api.getThreadMessages === 'function') {
      messages = await api.getThreadMessages(threadId, 60);
    } else if (typeof api.getMessages === 'function') {
      messages = await api.getMessages(threadId, { limit: 60 });
    }
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const match = messages.find((m) => {
      const msgId = m?.msgId || m?.globalMsgId || m?.messageId || m?.data?.msgId || null;
      const cli = m?.cliMsgId || m?.clientMsgId || m?.data?.cliMsgId || null;
      if (wantMsgId && msgId != null && String(msgId) === wantMsgId) return true;
      if (wantCli && cli != null && String(cli) === wantCli) return true;
      return false;
    });

    const candidate = match?.data || match || null;
    const atts = candidate?.attachments || candidate?.propertyExt?.attachments || null;
    return Array.isArray(atts) && atts.length ? atts : null;
  } catch {
    return null;
  }
}

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;
  const sub = String(args[0] || '').toLowerCase();
  const wantsDebug = args.some((a) => String(a || '').toLowerCase() === '--debug');

  if (sub === 'api') {
    const keys = api && (typeof api === 'object' || typeof api === 'function') ? Object.keys(api) : [];
    const ownNames = api && (typeof api === 'object' || typeof api === 'function')
      ? Object.getOwnPropertyNames(api).slice(0, 160)
      : [];
    const protoNames = api && (typeof api === 'object' || typeof api === 'function')
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(api) || {}).slice(0, 160)
      : [];
    const stickerKeys = keys
      .filter((k) => /sticker|custom/i.test(String(k)))
      .slice(0, 80);

    const customObj = api?.custom;
    const customType = customObj == null ? String(customObj) : typeof customObj;
    const customKeys = customObj && (typeof customObj === 'object' || typeof customObj === 'function')
      ? Object.keys(customObj).slice(0, 120)
      : [];
    const customOwn = customObj && (typeof customObj === 'object' || typeof customObj === 'function')
      ? Object.getOwnPropertyNames(customObj).slice(0, 160)
      : [];
    const customProto = customObj && (typeof customObj === 'object' || typeof customObj === 'function')
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(customObj) || {}).slice(0, 160)
      : [];
    const customStickerKeys = [...customKeys, ...customOwn, ...customProto]
      .filter((k) => /sticker|custom|webp/i.test(String(k)))
      .slice(0, 120);
    const msg = [
      '🔎 STK API',
      `- total_keys: ${keys.length}`,
      `- sticker_keys(${stickerKeys.length}):`,
      stickerKeys.join(', ') || '(none)',
      `- ownPropertyNames(${ownNames.length}):`,
      ownNames.join(', ') || '(none)',
      `- protoPropertyNames(${protoNames.length}):`,
      protoNames.join(', ') || '(none)',
      `- custom_type: ${customType}`,
      `- custom_keys(${customKeys.length}):`,
      customKeys.join(', ') || '(none)',
      `- custom_ownPropertyNames(${customOwn.length}):`,
      customOwn.join(', ') || '(none)',
      `- custom_protoPropertyNames(${customProto.length}):`,
      customProto.join(', ') || '(none)',
      `- custom_sticker_keys(${customStickerKeys.length}):`,
      customStickerKeys.join(', ') || '(none)',
    ].join('\n');
    return api.sendMessage({ msg }, threadId, type);
  }

  if (sub !== 'ddi') {
    return api.sendMessage({ msg: '❌ Dùng: stk ddi (reply ảnh)' }, threadId, type);
  }

  try {
    const source = await resolveReplyImage({ api, event, threadId });
    if (!source) {
      if (wantsDebug) {
        const dbg = buildDebugInfo(event);
        return api.sendMessage({ msg: dbg }, threadId, type);
      }
      return api.sendMessage({ msg: '❌ Vui lòng reply 1 ảnh để tạo sticker.' }, threadId, type);
    }

    const outPath = await buildStickerFromImage(source.buffer);

    let uploadedUrl = null;
    if (typeof api?.uploadAttachment === 'function') {
      try {
        let uploadRes;
        try {
          uploadRes = await api.uploadAttachment(outPath, threadId, type);
        } catch {
          uploadRes = await api.uploadAttachment([outPath], threadId, type);
        }
        const first = Array.isArray(uploadRes) ? uploadRes[0] : uploadRes;
        uploadedUrl = first?.fileUrl || first?.normalUrl || null;
      } catch (e) {
        uploadedUrl = null;
      }
    }

    const sendStickerFn = pickSendCustomStickerFn(api);
    if (sendStickerFn && uploadedUrl) {
      const { width, height } = await getWebpSize(outPath);
      const w = Number.isFinite(width) ? width : 256;
      const h = Number.isFinite(height) ? height : 256;
      try {
        await sendStickerFn(api, event, uploadedUrl, w, h);
        cleanupFiles([outPath]);
        return;
      } catch (e) {
        // fall through to send webp as image
      }
    }

    // Fallback: send WEBP as normal attachment
    try {
      await api.sendMessage({
        msg: uploadedUrl ? '🧩 Sticker (WEBP) (fallback)' : '🧩 Sticker (WEBP)',
        attachments: [outPath],
      }, threadId, type);
    } catch (e) {
      cleanupFiles([outPath]);
      return api.sendMessage({ msg: `⚠️ Không gửi được sticker. Lỗi: ${e?.message || e}` }, threadId, type);
    }

    cleanupFiles([outPath]);
  } catch (error) {
    console.error('[stk ddi] error:', error);
    return api.sendMessage({ msg: '❌ Không thể tạo sticker. Hãy thử lại với ảnh khác.' }, threadId, type);
  }
};

function pickSendCustomStickerFn(api) {
  if (!api || typeof api !== 'object') return null;
  const candidates = [
    'sendCustomSticker',
    'sendStickerCustom',
    'sendStickerUrl',
    'sendStickerWithUrl',
  ];
  const targets = [api];
  if (api.custom && typeof api.custom === 'object') targets.push(api.custom);

  for (const target of targets) {
    for (const name of candidates) {
      if (typeof target?.[name] === 'function') {
        // Wrap to handle signature variants
        return async (apiObj, event, url, w, h) => {
          const fn = target[name].bind(target);
          // Variant A: ({threadId,type}, url, url, w, h, 0)
          try {
            return await fn({ threadId: event.threadId, type: event.type }, url, url, w, h, 0);
          } catch {}
          // Variant B: (message, url, url, w, h)
          return fn(event, url, url, w, h);
        };
      }
    }
  }
  return null;
}

async function getWebpSize(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    return { width: meta?.width, height: meta?.height };
  } catch {
    return { width: null, height: null };
  }
}

function pickAttachmentUrl(att) {
  if (!att || typeof att !== 'object') return null;
  const candidates = [
    att.href,
    att.url,
    att.downloadUrl,
    att.fileUrl,
    att.normalUrl,
    att.hdUrl,
    att.thumb,
    att.thumbSrc,
    att.thumbnail,
    att.thumbnailUrl,
  ];
  for (const u of candidates) {
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function safeDecodeUrl(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return null;
    const normalized = raw.replace(/\\\//g, '/');
    try {
      return decodeURIComponent(normalized);
    } catch {
      return normalized;
    }
  } catch {
    return null;
  }
}

function extractUrlFromQuoteAttach(quote) {
  try {
    if (!quote) return null;
    const attachRaw = quote?.attach || quote?.attachment || quote?.attachments;
    if (typeof attachRaw !== 'string' || !attachRaw.trim()) return null;
    let parsed;
    try {
      parsed = JSON.parse(attachRaw);
    } catch {
      return null;
    }

    const urlCandidate = parsed?.hdUrl || parsed?.href || parsed?.normalUrl || parsed?.url || null;
    const decoded = safeDecodeUrl(urlCandidate);
    if (!decoded || !/^https?:\/\//i.test(decoded)) return null;
    if (decoded.toLowerCase().includes('jxl')) {
      return decoded.replace(/jxl/gi, 'jpg');
    }
    return decoded;
  } catch {
    return null;
  }
}

function looksLikeImage(att, url) {
  const contentType = String(att?.contentType || att?.mimeType || '').toLowerCase();
  if (contentType.includes('image')) return true;
  const u = String(url || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(u);
}

async function resolveReplyImage({ api, event, threadId }) {
  const sources = [];

  const reply = event?.messageReply || event?.repliedMessage;
  if (reply?.data) sources.push(reply.data);

  const eventData = event?.data;
  if (eventData) {
    if (eventData.quote) sources.push(eventData.quote);
    if (eventData.propertyExt?.quote) sources.push(eventData.propertyExt.quote);
    sources.push(eventData);
    if (eventData.propertyExt) sources.push(eventData.propertyExt);
  }

  const quoteRoot = event?.data?.quote || event?.data?.propertyExt?.quote || null;
  const attachUrl = extractUrlFromQuoteAttach(quoteRoot);
  if (attachUrl) {
    const buffer = await downloadFile(attachUrl);
    return { buffer };
  }

  for (const data of sources) {
    const attachments = data?.attachments || data?.propertyExt?.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) continue;

    const att = attachments[0];
    const url = pickAttachmentUrl(att);
    if (!url) continue;
    if (!looksLikeImage(att, url)) continue;

    const buffer = await downloadFile(url);
    return { buffer };
  }

  const deepUrls = findImageUrlsDeep(event, { max: 1 });
  if (deepUrls.length) {
    const buffer = await downloadFile(deepUrls[0]);
    return { buffer };
  }

  const quote = event?.data?.quote || event?.data?.propertyExt?.quote || null;
  const quoteMsgId = quote?.msgId || quote?.globalMsgId || quote?.messageId || null;
  const quoteCli = quote?.cliMsgId || quote?.clientMsgId || quote?.cliMsgID || null;
  const quotedAttachments = await fetchQuotedMessageAttachments({ api, threadId, quoteMsgId, quoteCliMsgId: quoteCli });
  if (Array.isArray(quotedAttachments) && quotedAttachments.length) {
    const att = quotedAttachments[0];
    const url = pickAttachmentUrl(att);
    if (url && looksLikeImage(att, url)) {
      const buffer = await downloadFile(url);
      return { buffer };
    }
  }

  return null;
}

async function downloadFile(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

async function buildStickerFromImage(buffer) {
  const baseName = `stk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const outPath = path.join(TEMP_DIR, `${baseName}.webp`);

  await sharp(buffer)
    .resize(256, 256, {
      fit: 'contain',
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 92, effort: 5 })
    .toFile(outPath);

  return outPath;
}

function cleanupFiles(files = []) {
  for (const file of files) {
    if (!file) continue;
    setTimeout(() => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }, 10000);
  }
}
