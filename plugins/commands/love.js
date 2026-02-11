const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

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

function daysBetween(startTs, endTs) {
  const a = new Date(Number(startTs) || 0);
  const b = new Date(Number(endTs) || Date.now());
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function durationBreakdown(startTs, endTs) {
  const start = Number(startTs) || 0;
  const end = Number(endTs) || Date.now();
  const ms = Math.max(0, end - start);
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { ms, totalSeconds, days, hours, minutes, seconds };
}

function nextMilestoneInfo(startTs, endTs) {
  const start = Number(startTs) || 0;
  const now = Number(endTs) || Date.now();
  const ms = Math.max(0, now - start);
  const days = Math.floor(ms / 86400000);

  const candidates = [
    7,
    30,
    50,
    100,
    200,
    365,
    500,
    730,
    1000,
    1500,
    2000,
    3000,
    5000,
    10000,
  ];
  let target = candidates.find((x) => x > days);
  if (!target) {
    const next = Math.ceil((days + 1) / 1000) * 1000;
    target = Math.max(next, days + 1);
  }
  const ts = start + target * 86400000;
  return {
    targetDays: target,
    remainingDays: Math.max(0, target - days),
    dateStr: new Date(ts).toLocaleDateString('vi-VN'),
  };
}

function drawHeart(ctx, cx, cy, size) {
  const s = Math.max(20, Number(size) || 120);
  const top = cy - s * 0.15;
  ctx.beginPath();
  ctx.moveTo(cx, top + s * 0.28);
  ctx.bezierCurveTo(cx - s * 0.52, top - s * 0.18, cx - s * 0.92, top + s * 0.45, cx, top + s);
  ctx.bezierCurveTo(cx + s * 0.92, top + s * 0.45, cx + s * 0.52, top - s * 0.18, cx, top + s * 0.28);
  ctx.closePath();
}

async function downloadAsBuffer(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(resp.data);
}

async function safeLoadAvatar(url) {
  if (!url) return null;
  try {
    // canvas loadImage can load http(s) sometimes, but keep it robust.
    const buf = await downloadAsBuffer(url);
    return await loadImage(buf);
  } catch {
    try {
      return await loadImage(url);
    } catch {
      return null;
    }
  }
}

async function fetchProfile(api, uid) {
  if (!api || typeof api.getUserInfo !== 'function' || !uid) return null;
  try {
    const info = await api.getUserInfo(String(uid));
    const changed = info?.changed_profiles || {};
    const unchanged = info?.unchanged_profiles || {};
    return changed[String(uid)] || unchanged[String(uid)] || info?.[String(uid)] || null;
  } catch {
    return null;
  }
}

async function createLoveCard({ aName, bName, aAvatarUrl, bAvatarUrl, startTs }) {
  const WIDTH = 1400;
  const HEIGHT = 860;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#06121b');
  bg.addColorStop(0.45, '#101826');
  bg.addColorStop(1, '#2a1142');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const blob1 = ctx.createRadialGradient(WIDTH * 0.2, HEIGHT * 0.25, 20, WIDTH * 0.2, HEIGHT * 0.25, Math.min(WIDTH, HEIGHT) * 0.65);
    blob1.addColorStop(0, 'rgba(98, 255, 228, 0.20)');
    blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const blob2 = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.5, 20, WIDTH * 0.85, HEIGHT * 0.5, Math.min(WIDTH, HEIGHT) * 0.75);
    blob2.addColorStop(0, 'rgba(170, 90, 255, 0.25)');
    blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  // header
  const headerX = 70;
  const headerY = 60;
  const headerW = WIDTH - 140;
  const headerH = 170;

  ctx.save();
  ctx.globalAlpha = 0.78;
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
  ctx.font = '800 56px Arial';
  ctx.fillText('LOVE STORY', headerX + 40, headerY + 84);

  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '400 30px Arial';
  ctx.fillText('Hồ sơ hẹn hò của nhóm', headerX + 40, headerY + 134);

  // body card
  const cardX = 70;
  const cardY = headerY + headerH + 30;
  const cardW = WIDTH - 140;
  const cardH = HEIGHT - cardY - 70;

  ctx.save();
  ctx.globalAlpha = 0.85;
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

  const startStr = new Date(Number(startTs) || Date.now()).toLocaleDateString('vi-VN');
  const nowTs = Date.now();
  const days = daysBetween(startTs, nowTs);
  const dur = durationBreakdown(startTs, nowTs);
  const nextMile = nextMilestoneInfo(startTs, nowTs);

  // avatars
  const avatarSize = 220;
  const leftAvatarX = cardX + 120;
  const avatarY = cardY + 110;
  const rightAvatarX = cardX + cardW - 120 - avatarSize;

  const aImg = await safeLoadAvatar(aAvatarUrl);
  const bImg = await safeLoadAvatar(bAvatarUrl);

  function drawAvatar(img, x, y, borderColorA, borderColorB) {
    // circle clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) {
      ctx.drawImage(img, x, y, avatarSize, avatarSize);
    } else {
      const g = ctx.createLinearGradient(x, y, x + avatarSize, y + avatarSize);
      g.addColorStop(0, 'rgba(99,102,241,0.35)');
      g.addColorStop(1, 'rgba(236,72,153,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, avatarSize, avatarSize);
    }
    ctx.restore();

    // border
    const stroke = ctx.createLinearGradient(x, y, x + avatarSize, y + avatarSize);
    stroke.addColorStop(0, borderColorA);
    stroke.addColorStop(1, borderColorB);

    ctx.beginPath();
    ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  drawAvatar(aImg, leftAvatarX, avatarY, '#60a5fa', '#a855f7');
  drawAvatar(bImg, rightAvatarX, avatarY, '#34d399', '#f472b6');

  const heartCx = WIDTH / 2;
  const heartCy = avatarY + avatarSize / 2 - 5;
  const heartSize = 165;
  ctx.save();
  drawHeart(ctx, heartCx, heartCy, heartSize);
  const heartGrad = ctx.createLinearGradient(heartCx - heartSize, heartCy - heartSize, heartCx + heartSize, heartCy + heartSize);
  heartGrad.addColorStop(0, 'rgba(96,165,250,0.98)');
  heartGrad.addColorStop(0.45, 'rgba(168,85,247,0.98)');
  heartGrad.addColorStop(1, 'rgba(244,114,182,0.98)');
  ctx.fillStyle = heartGrad;
  ctx.shadowColor = 'rgba(244,114,182,0.55)';
  ctx.shadowBlur = 35;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  ctx.restore();

  // names
  const nameY = avatarY + avatarSize + 70;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '800 42px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(aName || 'A'), leftAvatarX + avatarSize / 2, nameY);
  ctx.fillText(String(bName || 'B'), rightAvatarX + avatarSize / 2, nameY);

  // stats
  const statY = nameY + 90;
  ctx.textAlign = 'center';
  ctx.font = '700 32px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Bắt đầu: ${startStr}`, WIDTH / 2, statY);

  ctx.font = '900 54px Arial';
  const daysGrad = ctx.createLinearGradient(WIDTH / 2 - 220, statY + 30, WIDTH / 2 + 220, statY + 30);
  daysGrad.addColorStop(0, '#60a5fa');
  daysGrad.addColorStop(0.5, '#a855f7');
  daysGrad.addColorStop(1, '#f472b6');
  ctx.fillStyle = daysGrad;
  ctx.fillText(`${days} ngày`, WIDTH / 2, statY + 80);

  const infoBoxY = statY + 120;
  const boxW = 560;
  const boxH = 170;
  const gap = 40;
  const box1X = WIDTH / 2 - gap / 2 - boxW;
  const box2X = WIDTH / 2 + gap / 2;

  const drawInfoBox = (x, y, w, h, title, lines, accentA, accentB) => {
    ctx.save();
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    const stroke = ctx.createLinearGradient(x, y, x + w, y + h);
    stroke.addColorStop(0, accentA);
    stroke.addColorStop(1, accentB);
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 30px Arial';
    ctx.fillText(title, x + 26, y + 46);

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '600 26px Arial';
    let ty = y + 86;
    for (const line of lines) {
      ctx.fillText(line, x + 26, ty);
      ty += 34;
    }
  };

  const durationLine = `${dur.days}d ${dur.hours}h ${dur.minutes}m ${dur.seconds}s`;
  drawInfoBox(
    box1X,
    infoBoxY,
    boxW,
    boxH,
    'Đã yêu nhau',
    [durationLine, `Tổng: ${dur.totalSeconds.toLocaleString('vi-VN')} giây`],
    'rgba(96,165,250,0.55)',
    'rgba(168,85,247,0.45)'
  );
  drawInfoBox(
    box2X,
    infoBoxY,
    boxW,
    boxH,
    'Kỷ niệm tiếp theo',
    [`${nextMile.targetDays} ngày - còn ${nextMile.remainingDays} ngày`, nextMile.dateStr],
    'rgba(52,211,153,0.50)',
    'rgba(244,114,182,0.40)'
  );

  ctx.textAlign = 'left';

  const outPath = path.join(TEMP_DIR, `love_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return outPath;
}

module.exports.config = {
  name: 'love',
  aliases: ['lovecard', 'couple'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Xem hồ sơ hẹn hò (setlove).',
  category: 'Tiện ích',
  usage: 'love',
  cooldowns: 3,
};

module.exports.run = async ({ api, event }) => {
  const { threadId, type } = event || {};
  const db = readDb();
  const record = db[String(threadId)];

  if (!record?.a?.uid || !record?.b?.uid || !record?.startTs) {
    return api.sendMessage({ msg: 'ERROR: Nhóm này chưa setlove. Dùng: setlove @A @B | 01/01/2024 | nickA | nickB', ttl: 45000 }, threadId, type);
  }

  const aUid = record.a.uid;
  const bUid = record.b.uid;

  const [aProfile, bProfile] = await Promise.all([
    fetchProfile(api, aUid),
    fetchProfile(api, bUid),
  ]);

  const aName = record?.a?.nick || aProfile?.displayName || aProfile?.zaloName || 'A';
  const bName = record?.b?.nick || bProfile?.displayName || bProfile?.zaloName || 'B';

  const aAvatar = aProfile?.avatar || aProfile?.avatarUrl || aProfile?.profilePicture || aProfile?.picture || null;
  const bAvatar = bProfile?.avatar || bProfile?.avatarUrl || bProfile?.profilePicture || bProfile?.picture || null;

  let cardPath;
  try {
    cardPath = await createLoveCard({ aName, bName, aAvatarUrl: aAvatar, bAvatarUrl: bAvatar, startTs: record.startTs });
  } catch (e) {
    return api.sendMessage({ msg: `ERROR: Không tạo được love card: ${e?.message || e}`, ttl: 30000 }, threadId, type);
  }

  scheduleCleanup([cardPath], 120000);
  return api.sendMessage({
    msg: 'Love card',
    attachments: [cardPath],
    ttl: 180000,
  }, threadId, type);
};
