const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache', 'stickerauto');

function listDailyFoundFiles() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return [];
    const files = fs.readdirSync(CACHE_DIR);
    return files
      .filter((f) => /^found_\d{4}-\d{2}-\d{2}\.txt$/i.test(f))
      .map((f) => ({
        name: f,
        fullPath: path.join(CACHE_DIR, f),
        mtimeMs: (() => {
          try {
            return fs.statSync(path.join(CACHE_DIR, f)).mtimeMs;
          } catch {
            return 0;
          }
        })(),
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

function bootstrapBonzFileFromDaily() {
  const bonzPath = path.join(CACHE_DIR, 'found_bonz.txt');
  try {
    if (fs.existsSync(bonzPath)) {
      const s = fs.statSync(bonzPath);
      if (s.isFile() && s.size > 0) return bonzPath;
    }
  } catch {}

  const dailyFiles = listDailyFoundFiles();
  if (!dailyFiles.length) return bonzPath;

  const chosen = dailyFiles[0].fullPath;
  try {
    const content = fs.readFileSync(chosen, 'utf8');
    if (String(content || '').trim()) {
      fs.writeFileSync(bonzPath, content);
    }
  } catch {}

  return bonzPath;
}

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePositiveInt(v, fallback) {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function readFoundIds(day) {
  const dayKey = String(day || '').trim();
  const filePath = dayKey.toLowerCase() === 'bonz'
    ? bootstrapBonzFileFromDaily()
    : path.join(CACHE_DIR, `found_${dayKey}.txt`);
  if (!fs.existsSync(filePath)) {
    return { filePath, ids: [] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const ids = content
    .split(/\r?\n/)
    .map((x) => Number(String(x).trim()))
    .filter((x) => Number.isFinite(x) && x > 0);
  return { filePath, ids };
}

function unique(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function shuffle(arr) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function sendStickerById(api, stickerId, threadId, type) {
  if (typeof api?.getStickersDetail !== 'function' || typeof api?.sendSticker !== 'function') {
    throw new Error('Thiếu API getStickersDetail/sendSticker');
  }
  const details = await api.getStickersDetail(stickerId);
  const sticker = Array.isArray(details) && details.length ? details[0] : details;
  const stickerType = sticker?.type;
  const cateId = sticker?.cateId;
  if (typeof stickerType !== 'number' || typeof cateId !== 'number') {
    throw new Error('Không lấy được cateId/type');
  }
  await api.sendSticker({ id: stickerId, cateId, type: stickerType }, threadId, type);
}

module.exports.config = {
  name: 'stickergui',
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Gửi sticker thật từ danh sách đã bào của stickerauto',
  category: 'Tiện ích',
  usage: 'stickergui [count] [delayMs] [day=YYYY-MM-DD|today|bonz] [random|seq]',
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  const count = parsePositiveInt(args[0], 5);
  const delayMs = Math.max(0, Number(args[1]) || 500);

  const dayArg = String(args[2] || 'bonz').trim().toLowerCase();
  const day = dayArg === 'today' ? todayKey() : (dayArg === 'bonz' ? 'bonz' : String(args[2] || 'bonz').trim());

  const modeArg = String(args[3] || 'random').trim().toLowerCase();
  const mode = modeArg === 'seq' ? 'seq' : 'random';

  const { filePath, ids: rawIds } = readFoundIds(day);
  const ids = unique(rawIds);

  if (!ids.length) {
    return api.sendMessage({
      msg: `❌ Không có sticker nào trong file:\n${filePath}\n\n💡 Hãy chạy stickerauto trước để bào sticker.`,
      ttl: 60000,
    }, threadId, type);
  }

  const picked = (mode === 'seq' ? ids : shuffle(ids)).slice(0, Math.min(count, ids.length));

  let ok = 0;
  let fail = 0;
  const failList = [];

  await api.sendMessage({
    msg: `📤 STICKERGUI | BONZ\n- Nguồn: ${day === 'bonz' ? 'bonz' : day}\n- File: ${filePath}\n- Tổng ID có sẵn: ${ids.length}\n- Sẽ gửi: ${picked.length}\n- Delay: ${delayMs}ms\n- Mode: ${mode}`,
    ttl: 60000,
  }, threadId, type);

  for (const stickerId of picked) {
    try {
      await sendStickerById(api, stickerId, threadId, type);
      ok++;
    } catch (e) {
      fail++;
      failList.push({ id: stickerId, error: e?.message || String(e) });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const previewFail = failList.slice(0, 8).map((x) => `- ${x.id}: ${x.error}`).join('\n') || 'Không có';

  return api.sendMessage({
    msg: [
      `✅ STICKERGUI | BONZ`,
      `- Đã gửi: ${ok}/${picked.length}`,
      `- Thất bại: ${fail}`,
      fail ? `- Lỗi (top):\n${previewFail}` : null,
    ].filter(Boolean).join('\n'),
    ttl: 120000,
  }, threadId, type);
};
