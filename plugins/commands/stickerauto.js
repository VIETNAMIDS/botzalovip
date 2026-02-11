const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache', 'stickerauto');
const STATE_PATH = path.join(CACHE_DIR, 'state.json');

let runner = null;
let runnerStopping = false;
let runnerMeta = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayLabel(ts = Date.now()) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function loadState() {
  ensureDir(CACHE_DIR);
  if (!fs.existsSync(STATE_PATH)) {
    return {
      enabled: false,
      range: { from: 1, to: 300000 },
      cursor: 1,
      dailyLimit: 0,
      batchSize: 50,
      delayMs: 250,
      reportEveryBatches: 20,
      targetTotal: 10000000,
      lastRunAt: 0,
      day: todayKey(),
      dayCount: 0,
      totalFound: 0,
    };
  }
  const raw = fs.readFileSync(STATE_PATH, 'utf8');
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== 'object') return loadState();
  return {
    enabled: Boolean(parsed.enabled),
    range: {
      from: Number(parsed?.range?.from) || 1,
      to: Number(parsed?.range?.to) || 300000,
    },
    cursor: Number(parsed.cursor) || 1,
    dailyLimit: Math.max(0, Number(parsed.dailyLimit) || 0),
    batchSize: Math.max(1, Math.min(200, Number(parsed.batchSize) || 50)),
    delayMs: Math.max(0, Number(parsed.delayMs) || 250),
    reportEveryBatches: Math.max(1, Math.min(200, Number(parsed.reportEveryBatches) || 20)),
    targetTotal: Math.max(1, Number(parsed.targetTotal) || 10000000),
    lastRunAt: Number(parsed.lastRunAt) || 0,
    day: String(parsed.day || todayKey()),
    dayCount: Number(parsed.dayCount) || 0,
    totalFound: Number(parsed.totalFound) || 0,
  };
}

function saveState(state) {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function resultsPathForDay(day) {
  return path.join(CACHE_DIR, `found_${day}.txt`);
}

function resultsPathBonz() {
  return path.join(CACHE_DIR, 'found_bonz.txt');
}

function readFoundSetForDay(day, limitLines = 20000) {
  const set = new Set();

  const paths = [resultsPathForDay(day), resultsPathBonz()];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const take = lines.slice(-limitLines);
    for (const ln of take) {
      const n = Number(String(ln).trim());
      if (Number.isFinite(n) && n > 0) set.add(n);
    }
  }

  return set;
}

async function probeSticker(api, stickerId) {
  if (typeof api?.getStickersDetail !== 'function') {
    throw new Error('API getStickersDetail chưa khả dụng');
  }
  const details = await api.getStickersDetail(stickerId);
  if (!details) return null;
  const list = Array.isArray(details) ? details : [details];
  const first = list.find(Boolean);
  if (!first) return null;
  const cateId = first?.cateId;
  const type = first?.type;
  const id = first?.id;
  if (typeof id !== 'number' && typeof id !== 'string') return null;
  return { id: Number(id), cateId, type };
}

async function runBatch({ api, state }) {
  const nowDay = todayKey();
  if (state.day !== nowDay) {
    state.day = nowDay;
    state.dayCount = 0;
  }

  if (!state.enabled) {
    return { ran: false, reason: 'disabled' };
  }

  const hasDailyLimit = Number(state.dailyLimit) > 0;
  if (hasDailyLimit && state.dayCount >= state.dailyLimit) {
    return { ran: false, reason: 'daily_limit' };
  }

  if (Number(state.totalFound) >= Number(state.targetTotal)) {
    return { ran: false, reason: 'target_reached' };
  }

  const from = Math.max(1, Number(state.range.from) || 1);
  const to = Math.max(from, Number(state.range.to) || from);

  if (state.cursor < from || state.cursor > to) {
    state.cursor = from;
  }

  const remainingToday = hasDailyLimit ? (state.dailyLimit - state.dayCount) : state.batchSize;
  const count = Math.max(1, Math.min(state.batchSize, remainingToday));

  const foundSet = readFoundSetForDay(state.day);
  const foundToday = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    const id = state.cursor;
    state.cursor++;
    if (state.cursor > to) state.cursor = from;

    try {
      const detail = await probeSticker(api, id);
      if (detail && Number.isFinite(detail.id) && detail.id > 0) {
        if (!foundSet.has(detail.id)) {
          foundSet.add(detail.id);
          foundToday.push(detail.id);
        }
      }
    } catch (e) {
      const msg = e?.message || String(e);
      errors.push({ id, error: msg });
    }

    state.dayCount++;

    if (Number(state.totalFound) >= Number(state.targetTotal)) {
      break;
    }

    if (state.delayMs > 0) {
      await sleep(state.delayMs);
    }
  }

  if (foundToday.length) {
    const p = resultsPathForDay(state.day);
    const pBonz = resultsPathBonz();
    const payload = foundToday.map((x) => String(x)).join('\n') + '\n';
    fs.appendFileSync(p, payload);
    fs.appendFileSync(pBonz, payload);
    state.totalFound += foundToday.length;
  }

  state.lastRunAt = Date.now();
  saveState(state);

  return {
    ran: true,
    day: state.day,
    scanned: count,
    found: foundToday.length,
    foundIdsPreview: foundToday.slice(0, 20),
    errors: errors.slice(0, 5),
    cursor: state.cursor,
    dailyCount: state.dayCount,
    dailyLimit: state.dailyLimit,
    totalFound: state.totalFound,
    targetTotal: state.targetTotal,
  };
}

function formatStatus(state) {
  const day = todayKey();
  const enabled = state.enabled ? 'ON' : 'OFF';
  const mode = runner ? 'Tự động chạy nền' : 'Thủ công';
  const from = state.range.from;
  const to = state.range.to;
  const limitLine = Number(state.dailyLimit) > 0 ? String(state.dailyLimit) : '∞';
  const dayCount = state.day === day ? state.dayCount : 0;
  const ownerName = String(global?.config?.owner_name || global?.config?.OWNER_NAME || 'BONZ');

  return [
    `✅ STICKER AUTO | BONZ SYSTEM — RUNNING`,
    '',
    `⚙️ Chế độ: ${mode}`,
    `📌 Trạng thái: ${enabled}`,
    '',
    `🔢 Phạm vi quét: ${from.toLocaleString('vi-VN')} → ${to.toLocaleString('vi-VN')}`,
    `📦 Batch: ${state.batchSize}`,
    `⏱️ Delay: ${state.delayMs}ms`,
    `🧾 Báo cáo: mỗi ${state.reportEveryBatches} batch`,
    '',
    `📊 Giới hạn/ngày: ${limitLine}`,
    `📅 Hôm nay: ${dayCount}`,
    `🎯 Tổng sticker tìm được: ${Number(state.totalFound).toLocaleString('vi-VN')} / ${Number(state.targetTotal).toLocaleString('vi-VN')}`,
    '',
    `📄 File lưu trữ:`,
    resultsPathBonz(),
  ].join('\n');
}

function formatBonzReport({ state, result, ownerName }) {
  const dayLabel = todayLabel();
  const limitLine = Number(state.dailyLimit) > 0 ? state.dailyLimit : '∞';
  const scanned = result?.scanned ?? 0;
  const found = result?.found ?? 0;
  const previewIds = Array.isArray(result?.foundIdsPreview) && result.foundIdsPreview.length
    ? result.foundIdsPreview
    : [];
  const preview = previewIds.length ? previewIds.join(', ') : 'Không có';
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const errText = errors.length
    ? errors.map((x) => `- ${x.id}: ${x.error}`).join('\n')
    : 'Không có lỗi được ghi nhận';
  const filePath = resultsPathBonz();

  return [
    `✅ STICKER AUTO | BONZ SYSTEM`,
    '',
    `🗓️ Ngày: ${dayLabel}`,
    `👑 Owner: ${ownerName}`,
    `🔍 Sticker đã quét: ${scanned} ID`,
    `🎯 Sticker tìm được: ${found}`,
    `📊 Tiến độ hôm nay: ${state.dayCount} / ${limitLine}`,
    `📈 Tổng tiến độ: ${state.totalFound} / ${state.targetTotal}`,
    '',
    `👀 Preview Sticker ID:`,
    preview,
    '',
    `⚠️ Lỗi phát sinh:`,
    errText,
    '',
    `📄 File lưu trữ:`,
    filePath,
  ].join('\n');
}

async function startRunner({ api, threadId, type }) {
  if (runner) return false;
  runnerStopping = false;
  runnerMeta = { threadId, type, startedAt: Date.now(), batches: 0 };

  const loop = async () => {
    while (!runnerStopping) {
      const state = loadState();
      if (!state.enabled) {
        await sleep(1000);
        continue;
      }

      const result = await runBatch({ api, state });
      runnerMeta.batches++;

      if (!result.ran) {
        if (result.reason === 'target_reached') {
          const finalState = loadState();
          finalState.enabled = false;
          saveState(finalState);
          const ownerName = String(global?.config?.owner_name || global?.config?.OWNER_NAME || 'BONZ');
          await api.sendMessage({ msg: `🏁 Đã đạt target ${finalState.targetTotal}. Tự động dừng.\n\n${formatStatus(finalState)}`, ttl: 120000 }, threadId, type);
          break;
        }
        if (result.reason === 'daily_limit') {
          await sleep(15000);
          continue;
        }
        await sleep(1500);
        continue;
      }

      if (runnerMeta.batches % state.reportEveryBatches === 0) {
        const ownerName = String(global?.config?.owner_name || global?.config?.OWNER_NAME || 'BONZ');
        const msg = formatBonzReport({ state: loadState(), result, ownerName });
        await api.sendMessage({ msg, ttl: 120000 }, threadId, type);
      }
    }
  };

  runner = loop();
  return true;
}

async function stopRunner() {
  if (!runner) return false;
  runnerStopping = true;
  try {
    await Promise.race([runner, sleep(2000)]);
  } catch {}
  runner = null;
  runnerStopping = false;
  runnerMeta = null;
  return true;
}

module.exports.config = {
  name: 'stickerauto',
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Bật chế độ bào sticker Zalo theo stickerId và báo cáo số lượng mỗi ngày',
  category: 'Tiện ích',
  usage: 'stickerauto start|stop|on|off|status|run [from] [to] [limit/ngày] [batch] [delayMs] [reportEveryBatches] [targetTotal]',
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  const sub = String(args[0] || '').toLowerCase();
  const state = loadState();

  if (!sub || sub === 'status') {
    return api.sendMessage({ msg: formatStatus(state), ttl: 60000 }, threadId, type);
  }

  if (sub === 'start') {
    state.enabled = true;
    saveState(state);
    const started = await startRunner({ api, threadId, type });
    return api.sendMessage({ msg: formatStatus(loadState()), ttl: 90000 }, threadId, type);
  }

  if (sub === 'stop') {
    state.enabled = false;
    saveState(state);
    const stopped = await stopRunner();
    return api.sendMessage({ msg: formatStatus(loadState()), ttl: 90000 }, threadId, type);
  }

  if (sub === 'off') {
    state.enabled = false;
    saveState(state);
    await stopRunner();
    return api.sendMessage({ msg: formatStatus(loadState()), ttl: 60000 }, threadId, type);
  }

  if (sub === 'on') {
    const from = Number(args[1]);
    const to = Number(args[2]);
    const dailyLimit = Number(args[3]);
    const batchSize = Number(args[4]);
    const delayMs = Number(args[5]);
    const reportEveryBatches = Number(args[6]);
    const targetTotal = Number(args[7]);

    if (Number.isFinite(from) && from > 0) state.range.from = Math.floor(from);
    if (Number.isFinite(to) && to > 0) state.range.to = Math.floor(to);
    if (Number.isFinite(dailyLimit) && dailyLimit >= 0) state.dailyLimit = Math.floor(dailyLimit);
    if (Number.isFinite(batchSize) && batchSize > 0) state.batchSize = Math.floor(batchSize);
    if (Number.isFinite(delayMs) && delayMs >= 0) state.delayMs = Math.floor(delayMs);
    if (Number.isFinite(reportEveryBatches) && reportEveryBatches > 0) state.reportEveryBatches = Math.floor(reportEveryBatches);
    if (Number.isFinite(targetTotal) && targetTotal > 0) state.targetTotal = Math.floor(targetTotal);

    state.enabled = true;

    const day = todayKey();
    if (state.day !== day) {
      state.day = day;
      state.dayCount = 0;
    }

    if (state.cursor < state.range.from || state.cursor > state.range.to) {
      state.cursor = state.range.from;
    }

    saveState(state);

    const started = await startRunner({ api, threadId, type });
    return api.sendMessage({ msg: formatStatus(loadState()), ttl: 90000 }, threadId, type);
  }

  if (sub === 'run') {
    try {
      const result = await runBatch({ api, state });
      if (!result.ran) {
        if (result.reason === 'disabled') {
          return api.sendMessage({ msg: `⚠️ stickerauto đang OFF. Dùng: stickerauto on`, ttl: 40000 }, threadId, type);
        }
        if (result.reason === 'daily_limit') {
          return api.sendMessage({ msg: `⛔ Đã đạt limit/ngày (${state.dailyLimit}).\n\n${formatStatus(state)}`, ttl: 60000 }, threadId, type);
        }
        if (result.reason === 'target_reached') {
          return api.sendMessage({ msg: `🏁 Đã đạt target ${state.targetTotal}.\n\n${formatStatus(state)}`, ttl: 60000 }, threadId, type);
        }
        return api.sendMessage({ msg: `⚠️ Không chạy được: ${result.reason}`, ttl: 40000 }, threadId, type);
      }

      const ownerName = String(global?.config?.owner_name || global?.config?.OWNER_NAME || 'BONZ');
      const msg = formatBonzReport({ state: loadState(), result, ownerName });
      return api.sendMessage({ msg, ttl: 120000 }, threadId, type);
    } catch (e) {
      return api.sendMessage({ msg: `❌ stickerauto lỗi: ${e?.message || e}`, ttl: 60000 }, threadId, type);
    }
  }

  return api.sendMessage({ msg: '❌ Cú pháp: stickerauto on|off|status|run', ttl: 40000 }, threadId, type);
};
