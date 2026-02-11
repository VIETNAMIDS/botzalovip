const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

const { registerSelection, triggerSelectionByUser } = require('../utils/musicSelections');
const { collectMessageIds } = require('../utils/messageUtils');

const TEMP_DIR = path.join(__dirname, 'cache', 'sticker');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports.config = {
  name: "getsticker",
  aliases: ["stickers", "findsticker"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tìm sticker theo từ khóa và gửi sticker ngẫu nhiên",
  category: "Tiện ích",
  usage: "getsticker <từ khóa>",
  cooldowns: 3
};

function formatStickerList(ids = []) {
  if (!ids.length) return "❌ Không tìm thấy sticker nào.";
  const preview = ids.slice(0, 20);
  const lines = preview.map((id, idx) => `${idx + 1}. ${id}`);
  if (ids.length > preview.length) {
    lines.push(`... còn ${ids.length - preview.length} ID khác.`);
  }
  return [`✅ Tìm thấy ${ids.length} sticker:`, ...lines].join("\n");
}

function extractStickerId(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  if (typeof value === "object") {
    const candidate = value.id ?? value.stickerId ?? value.sticker_id;
    return extractStickerId(candidate);
  }
  return null;
}

function scheduleCleanup(files = [], delayMs = 60000) {
  if (!Array.isArray(files) || files.length === 0) return;
  setTimeout(() => {
    for (const f of files) {
      try {
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }, Math.max(5000, Number(delayMs) || 60000)).unref?.();
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function shuffleArray(arr) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

async function downloadImageAsBuffer(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(resp.data);
}

function findFirstUrlDeep(obj) {
  const seen = new Set();
  function walk(v, depth) {
    if (depth > 6) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^https?:\/\//i.test(s)) return s;
      return null;
    }
    if (!v || typeof v !== 'object') return null;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x, depth + 1);
        if (r) return r;
      }
      return null;
    }
    for (const k of Object.keys(v)) {
      const r = walk(v[k], depth + 1);
      if (r) return r;
    }
    return null;
  }
  return walk(obj, 0);
}

function pickStickerPreviewUrl(sticker) {
  if (!sticker || typeof sticker !== 'object') return null;
  const candidates = [
    sticker.animationImgUrl,
    sticker.staticImgUrl,
    sticker.previewUrl,
    sticker.thumb,
    sticker.thumbnail,
    sticker.thumbnailUrl,
    sticker.normalUrl,
    sticker.fileUrl,
    sticker.url,
    sticker.href,
    sticker.imgUrl,
    sticker.imageUrl,
  ].filter(Boolean);
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return findFirstUrlDeep(sticker);
}

async function fetchStickerPreviewList(api, ids) {
  const list = Array.isArray(ids) ? ids.slice(0, 10) : [];
  if (!list.length) return [];
  if (typeof api?.getStickersDetail !== 'function') {
    return list.map((id) => ({ id, previewUrl: null }));
  }

  const tasks = list.map(async (id) => {
    try {
      const details = await api.getStickersDetail(id);
      const sticker = Array.isArray(details) && details.length ? details[0] : details;
      return { id, previewUrl: pickStickerPreviewUrl(sticker) };
    } catch {
      return { id, previewUrl: null };
    }
  });

  return Promise.all(tasks);
}

async function createStickerListCanvas({ keyword, items }) {
  const list = Array.isArray(items) ? items.slice(0, 10) : [];
  const WIDTH = 1400;
  const cols = 2;
  const rows = Math.max(1, Math.min(5, Math.ceil(list.length / cols)));
  const HEIGHT = 260 + rows * 240 + Math.max(0, rows - 1) * 18 + 80;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#06121b');
  bg.addColorStop(0.45, '#101826');
  bg.addColorStop(1, '#2a1142');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const blob1 = ctx.createRadialGradient(WIDTH * 0.18, HEIGHT * 0.26, 20, WIDTH * 0.18, HEIGHT * 0.26, Math.min(WIDTH, HEIGHT) * 0.7);
    blob1.addColorStop(0, 'rgba(98, 255, 228, 0.20)');
    blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const blob2 = ctx.createRadialGradient(WIDTH * 0.84, HEIGHT * 0.5, 20, WIDTH * 0.84, HEIGHT * 0.5, Math.min(WIDTH, HEIGHT) * 0.8);
    blob2.addColorStop(0, 'rgba(170, 90, 255, 0.25)');
    blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  const headerX = 70;
  const headerY = 60;
  const headerW = WIDTH - 140;
  const headerH = 160;

  ctx.save();
  ctx.globalAlpha = 0.78;
  drawRoundedRect(ctx, headerX, headerY, headerW, headerH, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  const headerStroke = ctx.createLinearGradient(headerX, headerY, headerX + headerW, headerY + headerH);
  headerStroke.addColorStop(0, 'rgba(98,255,228,0.35)');
  headerStroke.addColorStop(1, 'rgba(236,72,153,0.28)');
  ctx.strokeStyle = headerStroke;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '700 54px Arial';
  ctx.fillText('STICKER SEARCH', headerX + 40, headerY + 78);

  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.font = '400 30px Arial';
  ctx.fillText(`Từ khóa: ${truncateText(keyword, 42)}`, headerX + 40, headerY + 128);

  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font = '400 26px Arial';
  ctx.fillText('Reply số (1-10) để chọn sticker', headerX + 40, headerY + 168);

  const startY = headerY + headerH + 34;
  const gridX = 70;
  const gridW = WIDTH - 140;
  const gap = 18;
  const cardW = (gridW - gap) / 2;
  const cardH = 240;

  const thumbs = await Promise.all(list.map(async (it) => {
    if (!it?.previewUrl) return null;
    try {
      const buf = await downloadImageAsBuffer(it.previewUrl);
      return await loadImage(buf);
    } catch {
      return null;
    }
  }));

  for (let i = 0; i < list.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = gridX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    const w = cardW;
    const h = cardH;

    ctx.save();
    ctx.globalAlpha = 0.80;
    drawRoundedRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    const stroke = ctx.createLinearGradient(x, y, x + w, y + h);
    stroke.addColorStop(0, 'rgba(99,102,241,0.35)');
    stroke.addColorStop(1, 'rgba(16,185,129,0.20)');
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();

    const badgeX = x + 22;
    const badgeY = y + 18;
    const badgeW = 62;
    const badgeH = 52;
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    badgeGrad.addColorStop(0, '#60a5fa');
    badgeGrad.addColorStop(1, '#a855f7');
    ctx.fillStyle = badgeGrad;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '800 34px Arial';
    // Number column-wise so it matches user expectation in 2 columns:
    // left column: 1..rows, right column: rows+1..rows*2
    const displayNo = row + 1 + col * rows;
    const no = String(displayNo);
    const tw = ctx.measureText(no).width;
    ctx.fillText(no, badgeX + (badgeW - tw) / 2, badgeY + 42);

    const thumb = thumbs[i];
    const thumbBoxX = x + 22;
    const thumbBoxY = y + 86;
    const thumbBoxSize = 132;
    ctx.save();
    drawRoundedRect(ctx, thumbBoxX, thumbBoxY, thumbBoxSize, thumbBoxSize, 28);
    ctx.clip();
    if (thumb) {
      const scale = Math.max(thumbBoxSize / thumb.width, thumbBoxSize / thumb.height);
      const dw = thumb.width * scale;
      const dh = thumb.height * scale;
      const dx = thumbBoxX + (thumbBoxSize - dw) / 2;
      const dy = thumbBoxY + (thumbBoxSize - dh) / 2;
      ctx.drawImage(thumb, dx, dy, dw, dh);
    } else {
      const ph = ctx.createLinearGradient(thumbBoxX, thumbBoxY, thumbBoxX + thumbBoxSize, thumbBoxY + thumbBoxSize);
      ph.addColorStop(0, 'rgba(99,102,241,0.35)');
      ph.addColorStop(1, 'rgba(236,72,153,0.28)');
      ctx.fillStyle = ph;
      ctx.fillRect(thumbBoxX, thumbBoxY, thumbBoxSize, thumbBoxSize);
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    drawRoundedRect(ctx, thumbBoxX, thumbBoxY, thumbBoxSize, thumbBoxSize, 28);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 30px Arial';
    ctx.fillText('Sticker', x + 176, y + 128);

    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.font = '400 24px Arial';
    ctx.fillText('Reply số để gửi', x + 176, y + 164);

    const idText = truncateText(String(list[i]?.id ?? ''), 22);
    if (idText) {
      ctx.fillStyle = 'rgba(255,255,255,0.46)';
      ctx.font = '400 22px Arial';
      ctx.fillText(`#${idText}`, x + 176, y + 198);
    }
  }

  const outPath = path.join(TEMP_DIR, `getsticker_list_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return outPath;
}

async function sendStickerById(api, stickerId, threadId, type) {
  if (typeof api?.getStickersDetail !== 'function' || typeof api?.sendSticker !== 'function') {
    throw new Error('Thiếu API getStickersDetail/sendSticker');
  }
  const details = await api.getStickersDetail(stickerId);
  const sticker = Array.isArray(details) && details.length ? details[0] : null;
  const stickerType = sticker?.type;
  const cateId = sticker?.cateId;
  if (typeof stickerType !== 'number' || typeof cateId !== 'number') {
    throw new Error('Không lấy được cateId/type');
  }
  await api.sendSticker({ id: stickerId, cateId, type: stickerType }, threadId, type);
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  const senderId = String(event?.data?.uidFrom || event?.authorId || event?.senderID);

  if (Array.isArray(args) && args.length === 1 && /^\d+$/.test(String(args[0] || '').trim())) {
    const handled = await triggerSelectionByUser(threadId, senderId, args.join(' '), api, event, 'getsticker');
    if (!handled) {
      await api.sendMessage({ msg: '⚠️ Không tìm thấy danh sách sticker gần đây. Hãy dùng: getsticker <từ khóa>', ttl: 30000 }, threadId, type);
    }
    return;
  }

  if (typeof api?.getStickers !== "function") {
    return api.sendMessage(
      "⚠️ API getStickers chưa khả dụng ở phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  const keyword = args.join(" ").trim();
  if (!keyword) {
    return api.sendMessage(
      "❌ Vui lòng nhập từ khóa. Ví dụ: getsticker xin chào",
      threadId,
      type
    );
  }

  try {
    const stickerIds = await api.getStickers(keyword);
    const rawList = Array.isArray(stickerIds) ? stickerIds : [];
    const ids = rawList
      .map((x) => extractStickerId(x))
      .filter((x) => typeof x === "number" && Number.isFinite(x));

    if (!ids.length) {
      return api.sendMessage({ msg: '❌ Không tìm thấy sticker nào.', ttl: 30000 }, threadId, type);
    }

    const randomized = shuffleArray(ids);
    const picked = randomized.slice(0, 10);

    const previewItems = await fetchStickerPreviewList(api, picked);
    const listPath = await createStickerListCanvas({ keyword, items: previewItems });
    scheduleCleanup([listPath], 90000);

    const sent = await api.sendMessage({
      msg: `✅ Tìm thấy ${ids.length} sticker cho: ${keyword}`,
      attachments: [listPath],
      ttl: 120000,
    }, threadId, type);

    const messageIds = collectMessageIds(sent);
    const items = picked;
    try {
      registerSelection({
        messageIds,
        threadId,
        senderId,
        platform: 'getsticker',
        items,
        ttl: 120000,
        onSelect: async ({ api: api2, event: ev2, index }) => {
          const raw = Number(index);
          const idx0 = raw - 1;
          const rows = Math.max(1, Math.min(5, Math.ceil(items.length / 2)));
          const col = Math.floor(idx0 / rows);
          const row = idx0 % rows;
          const pos = row * 2 + col;
          if (!Number.isFinite(idx0) || idx0 < 0 || pos < 0 || pos >= items.length) {
            await api2.sendMessage({ msg: '❌ Số không hợp lệ. Hãy reply 1-10.', ttl: 20000 }, ev2.threadId, ev2.type);
            return true;
          }
          const chosen = items[pos];
          try {
            await sendStickerById(api2, chosen, ev2.threadId, ev2.type);
          } catch (e) {
            await api2.sendMessage({ msg: `❌ Gửi sticker thất bại: ${e?.message || e}`, ttl: 30000 }, ev2.threadId, ev2.type);
          }
          return true;
        }
      });
    } catch (e) {
      // ignore selection registration failure
    }

    return;
  } catch (error) {
    console.error("[getsticker]", error);
    return api.sendMessage(
      `❌ Không thể tìm sticker. Lý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};
