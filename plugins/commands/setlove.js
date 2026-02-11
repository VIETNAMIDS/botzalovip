const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'love_profiles.json');
const TEMP_DIR = path.join(__dirname, 'cache', 'love');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function ensureDataFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify({}, null, 2), 'utf8');
}

function readDb() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function scheduleCleanup(files = [], delayMs = 90000) {
  if (!Array.isArray(files) || files.length === 0) return;
  setTimeout(() => {
    for (const f of files) {
      try {
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }, Math.max(5000, Number(delayMs) || 90000)).unref?.();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function createSetloveHelpImage() {
  const WIDTH = 1400;
  const HEIGHT = 880;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#06121b');
  bg.addColorStop(0.45, '#101826');
  bg.addColorStop(1, '#2a1142');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const blob1 = ctx.createRadialGradient(WIDTH * 0.2, HEIGHT * 0.2, 20, WIDTH * 0.2, HEIGHT * 0.2, Math.min(WIDTH, HEIGHT) * 0.65);
    blob1.addColorStop(0, 'rgba(98, 255, 228, 0.18)');
    blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const blob2 = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.55, 20, WIDTH * 0.85, HEIGHT * 0.55, Math.min(WIDTH, HEIGHT) * 0.75);
    blob2.addColorStop(0, 'rgba(244, 114, 182, 0.20)');
    blob2.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  const headerX = 70;
  const headerY = 60;
  const headerW = WIDTH - 140;
  const headerH = 170;

  ctx.save();
  ctx.globalAlpha = 0.82;
  roundRect(ctx, headerX, headerY, headerW, headerH, 28);
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
  ctx.font = '900 56px Arial';
  ctx.fillText('SETLOVE - HƯỚNG DẪN', headerX + 40, headerY + 84);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '500 30px Arial';
  ctx.fillText('Tạo hồ sơ hẹn hò + xem love card (lưu vĩnh viễn)', headerX + 40, headerY + 134);

  const cardX = 70;
  const cardY = headerY + headerH + 30;
  const cardW = WIDTH - 140;
  const cardH = HEIGHT - cardY - 70;

  ctx.save();
  ctx.globalAlpha = 0.86;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  const cardStroke = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cardStroke.addColorStop(0, 'rgba(99,102,241,0.35)');
  cardStroke.addColorStop(1, 'rgba(16,185,129,0.20)');
  ctx.strokeStyle = cardStroke;
  ctx.stroke();
  ctx.restore();

  const leftX = cardX + 50;
  let y = cardY + 70;

  const drawSection = (title, lines, accentA, accentB) => {
    const titleGrad = ctx.createLinearGradient(leftX, y, leftX + 520, y);
    titleGrad.addColorStop(0, accentA);
    titleGrad.addColorStop(1, accentB);
    ctx.fillStyle = titleGrad;
    ctx.font = '900 34px Arial';
    ctx.fillText(title, leftX, y);
    y += 26;

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '600 28px Arial';
    for (const line of lines) {
      y += 40;
      ctx.fillText(line, leftX, y);
    }
    y += 62;
  };

  drawSection(
    '1) SET HỒ SƠ',
    [
      'setlove @A @B | 01/01/2024 | nickA | nickB',
      'Hoặc: setlove @A @B 01/01/2024 nickA nickB',
      'Ngày hỗ trợ: dd/mm/yyyy | yyyy-mm-dd',
    ],
    'rgba(96,165,250,0.95)',
    'rgba(168,85,247,0.95)'
  );

  drawSection(
    '2) XEM LOVE CARD',
    ['love'],
    'rgba(52,211,153,0.95)',
    'rgba(244,114,182,0.95)'
  );

  drawSection(
    '3) KIỂM TRA / RESET',
    ['setlove info', 'setlove reset'],
    'rgba(244,114,182,0.95)',
    'rgba(96,165,250,0.95)'
  );

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '500 24px Arial';
  ctx.fillText('Tip: đã set 1 lần là lưu vĩnh viễn (restart bot không mất).', leftX, HEIGHT - 105);

  const outPath = path.join(TEMP_DIR, `setlove_help_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return outPath;
}

function writeDb(db) {
  ensureDataFile();
  const payload = JSON.stringify(db || {}, null, 2);
  const tmpPath = `${DATA_PATH}.tmp`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, DATA_PATH);
  } catch {
    try {
      fs.writeFileSync(DATA_PATH, payload, 'utf8');
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }
}

function normalizeMentions(event) {
  const out = [];
  const d = event?.data || {};

  const candidates = [d.mentions, event?.mentions];
  for (const m of candidates) {
    if (!m) continue;
    if (Array.isArray(m)) {
      for (const it of m) {
        const uid = it?.uid || it?.id || it?.userId || it?.userID;
        const name = it?.tag || it?.title || it?.name || null;
        if (uid) out.push({ uid: String(uid), name: name ? String(name) : null });
      }
    } else if (typeof m === 'object') {
      // sometimes object keyed by uid, or values are {uid}
      const keys = Object.keys(m);
      if (keys.length && typeof m[keys[0]] === 'string') {
        for (const uid of keys) {
          out.push({ uid: String(uid), name: String(m[uid] || '') || null });
        }
      } else {
        for (const v of Object.values(m)) {
          const uid = v?.uid || v?.id || v?.userId || v?.userID;
          const name = v?.tag || v?.title || v?.name || null;
          if (uid) out.push({ uid: String(uid), name: name ? String(name) : null });
        }
      }
    }
  }

  // unique by uid
  const seen = new Set();
  return out.filter((x) => {
    if (!x?.uid) return false;
    if (seen.has(x.uid)) return false;
    seen.add(x.uid);
    return true;
  });
}

function parseDateToTs(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // timestamp
  if (/^\d{12,}$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  // yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const ts = dt.getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  // dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/').map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const ts = dt.getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  const dt = new Date(raw);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function parseSetloveArgs(args = []) {
  const text = Array.isArray(args) ? args.join(' ').trim() : '';
  if (!text) return { dateRaw: null, nickA: null, nickB: null };

  // format: <anything> | <date> | <nickA> | <nickB>
  if (text.includes('|')) {
    const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { dateRaw: null, nickA: null, nickB: null };
    const dateRaw = parts[0] || null;
    const nickA = parts[1] || null;
    const nickB = parts[2] || null;
    return { dateRaw, nickA, nickB };
  }

  // fallback: <date> <nickA> <nickB>
  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const dateRaw = tokens[0] || null;
  const nickA = tokens[1] || null;
  const nickB = tokens[2] || null;
  return { dateRaw, nickA, nickB };
}

module.exports.config = {
  name: 'setlove',
  aliases: ['setcouple', 'setdate'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Set hồ sơ hẹn hò cho nhóm (lưu lại sau restart).',
  category: 'Tiện ích',
  usage: 'setlove @A @B | dd/mm/yyyy | nickA | nickB  (hoặc: setlove reset)',
  cooldowns: 3,
};

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || event?.senderID || '');

  const sub = String(args[0] || '').toLowerCase();
  if (sub === 'help' || sub === 'h' || sub === 'hd' || sub === '?') {
    let imgPath;
    try {
      imgPath = createSetloveHelpImage();
    } catch (e) {
      return api.sendMessage({ msg: `ERROR: Không tạo được ảnh help: ${e?.message || e}`, ttl: 30000 }, threadId, type);
    }
    scheduleCleanup([imgPath], 120000);
    return api.sendMessage({
      msg: 'Setlove Help',
      attachments: [imgPath],
      ttl: 180000,
    }, threadId, type);
  }
  if (sub === 'info' || sub === 'check' || sub === 'status') {
    const db = readDb();
    const rec = db[String(threadId)];
    if (!rec) {
      return api.sendMessage({
        msg: `INFO: Nhóm này chưa setlove.\n- File lưu: ${DATA_PATH}`,
        ttl: 45000,
      }, threadId, type);
    }
    const startStr = new Date(Number(rec.startTs) || Date.now()).toLocaleString('vi-VN');
    return api.sendMessage({
      msg: `SETLOVE INFO\n- File lưu: ${DATA_PATH}\n- A: ${rec?.a?.uid}${rec?.a?.nick ? ` (${rec.a.nick})` : ''}\n- B: ${rec?.b?.uid}${rec?.b?.nick ? ` (${rec.b.nick})` : ''}\n- Start: ${startStr}`,
      ttl: 60000,
    }, threadId, type);
  }
  if (sub === 'reset' || sub === 'clear' || sub === 'del' || sub === 'remove') {
    const db = readDb();
    if (db && db[String(threadId)]) {
      delete db[String(threadId)];
      writeDb(db);
    }
    return api.sendMessage({ msg: 'OK: Đã reset setlove cho nhóm này.', ttl: 30000 }, threadId, type);
  }

  const mentions = normalizeMentions(event);
  if (!mentions || mentions.length < 2) {
    return api.sendMessage({
      msg: 'ERROR: Bạn phải tag 2 người.\nVí dụ: setlove @A @B | 01/01/2024 | anh | em',
      ttl: 45000,
    }, threadId, type);
  }

  const [m1, m2] = mentions;
  // args thường chứa 2 token mention đầu, phần còn lại là date/nick.
  // Nếu bot runtime không đưa mention vào args, người dùng vẫn có thể nhập date sau cùng.
  const restArgs = args.length >= 3 ? args.slice(2) : args.slice(1);
  const { dateRaw, nickA, nickB } = parseSetloveArgs(restArgs);
  const parsedTs = parseDateToTs(dateRaw);
  const startTs = parsedTs || Date.now();

  const db = readDb();
  db[String(threadId)] = {
    a: { uid: m1.uid, nick: nickA || null },
    b: { uid: m2.uid, nick: nickB || null },
    startTs,
    createdBy: senderId || null,
    updatedAt: Date.now(),
  };
  writeDb(db);

  const startStr = new Date(startTs).toLocaleDateString('vi-VN');
  return api.sendMessage({
    msg: `OK: Đã setlove cho nhóm này!\n- Ngày bắt đầu: ${startStr}\n- Dùng: love để xem card`,
    ttl: 45000,
  }, threadId, type);
};
