const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ThreadType, GroupEventType } = require('zca-js');
const { processVideo } = require('../../utils/index');

const MESSAGE_DELAY_MS = 300;
const NETWORK_TIMEOUT = 10_000;
const DEFAULT_INTERVAL_MINUTES = 10;
const PRIMARY_MEDIA_ENDPOINT = 'https://api.zeidteam.xyz/media-downloader/atd2';
const SECONDARY_MEDIA_ENDPOINT = 'https://api.zeidteam.xyz/media-downloader/atd3';
const TIKWM_API_ENDPOINT = 'https://www.tikwm.com/api/';
const TIKTOK_HOST_PATTERNS = ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'];

const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'auto_rai');
const TEMP_ROOT = path.join(__dirname, '..', '..', 'temp', 'auto_rai');
const EXTERNAL_MESSAGE_DIR = path.join(__dirname, '..', '..', 'adv');
const VIDEO_CACHE_TTL_MS = 15 * 60 * 1000;

if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
if (!fs.existsSync(TEMP_ROOT)) fs.mkdirSync(TEMP_ROOT, { recursive: true });
if (!fs.existsSync(EXTERNAL_MESSAGE_DIR)) fs.mkdirSync(EXTERNAL_MESSAGE_DIR, { recursive: true });

const accountRegistry = new Map(); // accountKey -> { threadLoops: Map, allLoop: { running, timer } }
const videoUploadCache = new Map(); // url -> { payload, cachedAt }
const activeStateCache = new Map(); // accountKey -> { threads: [], runAll: boolean }
const resumeInitializedAccounts = new Set();
const ACTIVE_STATE_DEFAULT = { threads: [], runAll: false };

function clearAllContent(accountKey) {
  try {
    saveMessage(accountKey, '');
    saveImages(accountKey, []);
    saveVideos(accountKey, []);
    saveCard(accountKey, {});
    saveActiveState(accountKey, { ...ACTIVE_STATE_DEFAULT });

    const dir = ensureAccountDir(accountKey);
    const targets = ['message.txt', 'images.json', 'videos.json', 'card.json'];
    for (const name of targets) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.writeFileSync(filePath, name.endsWith('.txt') ? '' : name.endsWith('.json') ? (name === 'card.json' ? '{}' : '[]') : '');
          }
        } catch (err) {
          console.warn('[adv] Không thể đặt lại file', filePath, err?.message || err);
        }
      }
    }

    for (const [key] of videoUploadCache.entries()) {
      if (key.startsWith('local:')) {
        videoUploadCache.delete(key);
      }
    }
  } catch (error) {
    console.error('[adv] clearAllContent lỗi:', error?.message || error);
  }
}

module.exports.config = {
  name: 'adv',
  aliases: ['rai', 'adv1', 'adv2', 'adv3', 'adv4', 'adv5'],
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Tự động rải nội dung (text / ảnh / video / danh thiếp) vào nhóm.',
  category: 'Automation',
  usage: 'adv help',
  cooldowns: 2
};

module.exports.onLoad = async function ({ api } = {}) {
  process.on('exit', cleanupAll);
  try {
    if (!api) return;
    const accountKeys = listAccountKeys();
    for (const key of accountKeys) {
      ensureResumeForAccount(api, key);
    }
  } catch (error) {
    console.error('[adv] onLoad resume lỗi:', error?.message || error);
  }
};

module.exports.run = async function ({ api, event, args, commandName }) {
  try {
    const { threadId, type, data } = event;
    if (type !== ThreadType.Group) {
      return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
    }

    const senderId = String(data?.uidFrom || event?.authorId || '');
    if (!isBotAdmin(senderId)) {
      return api.sendMessage('🚫 Bạn không có quyền thao tác auto rải.', threadId, type);
    }

    const accountKey = resolveAccountKey(api, commandName);
    ensureResumeForAccount(api, accountKey);
    const accountState = ensureAccountState(accountKey);

    const action = (args[0] || '').toLowerCase();
    const subAction = (args[1] || '').toLowerCase();
    const attachments = Array.isArray(data?.attachments) ? data.attachments : [];

    if (!action || action === 'help') {
      return api.sendMessage({ msg: buildHelpText() }, threadId, type);
    }

    switch (action) {
      case 'set': {
        const content = args.slice(1).join(' ').trim();
        if (!content) {
          return api.sendMessage('😵‍💫 Dùng: adv set <nội dung>', threadId, type);
        }
        saveMessage(accountKey, content);
        return api.sendMessage(`✔️ Đã lưu nội dung rải: ${content}`, threadId, type);
      }

      case 'file': {
        if (args.length < 2) {
          return api.sendMessage('😵‍💫 Cú pháp: adv file <tên-file>', threadId, type);
        }
        const rawName = args.slice(1).join(' ').trim();
        const baseName = path.basename(rawName);
        if (!baseName) {
          return api.sendMessage('😵‍💫 Tên file không hợp lệ.', threadId, type);
        }
        const fileName = path.extname(baseName) ? baseName : `${baseName}.txt`;
        const filePath = path.join(EXTERNAL_MESSAGE_DIR, fileName);
        if (!fs.existsSync(filePath)) {
          return api.sendMessage(`😵‍💫 Không tìm thấy file: ${fileName}`, threadId, type);
        }
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (!content.trim()) {
            return api.sendMessage('😵‍💫 File trống, không thể lưu.', threadId, type);
          }
          saveMessage(accountKey, content);
          return api.sendMessage(`✔️ Đã nạp nội dung từ file ${fileName}.`, threadId, type);
        } catch (error) {
          console.error('[adv] Không thể đọc file ngoại:', error?.message || error);
          return api.sendMessage('❌ Lỗi đọc file. Kiểm tra console.', threadId, type);
        }
      }

      case 'card': {
        if (!subAction) {
          return api.sendMessage('😵‍💫 Cú pháp: adv card set <uid> <nội dung> | adv card clear', threadId, type);
        }
        if (subAction === 'clear') {
          saveCard(accountKey, {});
          return api.sendMessage('✔️ Đã xoá danh thiếp.', threadId, type);
        }
        if (subAction === 'set') {
          const [uidRaw, ...rest] = args.slice(2);
          const uid = (uidRaw || '').trim();
          const content = rest.join(' ').trim();
          if (!uid || !/^[0-9]{6,}$/.test(uid) || !content) {
            return api.sendMessage('😵‍💫 Cú pháp: adv card set <uid> <nội dung>', threadId, type);
          }
          saveCard(accountKey, { uid, content });
          return api.sendMessage(`✔️ Đã lưu danh thiếp UID ${uid}.`, threadId, type);
        }
        return api.sendMessage('😵‍💫 Cú pháp: adv card set <uid> <nội dung> | adv card clear', threadId, type);
      }

      case 'image': {
        if (!subAction || !['add', 'remove', 'clear', 'list'].includes(subAction)) {
          return api.sendMessage('😵‍💫 Cú pháp: adv image add <link> | remove <số> | clear | list', threadId, type);
        }
        const images = loadImages(accountKey);
        if (subAction === 'clear') {
          saveImages(accountKey, []);
          return api.sendMessage('✔️ Đã xoá toàn bộ ảnh.', threadId, type);
        }
        if (subAction === 'list') {
          if (!images.length) {
            return api.sendMessage('😵‍💫 Danh sách ảnh trống.', threadId, type);
          }
          const lines = images.map((url, idx) => `${idx + 1}. ${url}`);
          return api.sendMessage(['📷 Danh sách ảnh:', ...lines].join('\n'), threadId, type);
        }
        if (subAction === 'remove') {
          const index = parseInt(args[2], 10) - 1;
          if (!Number.isFinite(index) || index < 0 || index >= images.length) {
            return api.sendMessage('😵‍💫 Số thứ tự không hợp lệ.', threadId, type);
          }
          const removed = images.splice(index, 1);
          saveImages(accountKey, images);
          return api.sendMessage(`✔️ Đã xoá ảnh: ${removed[0]}`, threadId, type);
        }
        if (subAction === 'add') {
          let added = false;
          if (attachments.length) {
            for (const attachment of attachments) {
              const url = normalizeAttachmentUrl(attachment);
              if (url && !images.includes(url)) {
                images.push(url);
                added = true;
              }
            }
          }
          if (!added && args.length >= 3) {
            const url = normalizeUrl(args.slice(2).join(' '));
            if (url && !images.includes(url)) {
              images.push(url);
              added = true;
            }
          }
          if (!added) {
            return api.sendMessage('😵‍💫 Không nhận được link hợp lệ hoặc ảnh đã tồn tại.', threadId, type);
          }
          saveImages(accountKey, images);
          return api.sendMessage(`✔️ Đã thêm ${attachments.length ? 'ảnh đính kèm' : 'ảnh'} (${images.length} tổng).`, threadId, type);
        }
        break;
      }

      case 'video': {
        if (!subAction || !['add', 'remove', 'clear', 'list', 'file', 'local'].includes(subAction)) {
          return api.sendMessage('😵‍💫 Cú pháp: adv video add <link> | remove <số> | clear | list | file <tên-file> | local <tên-file>', threadId, type);
        }
        const videos = loadVideos(accountKey);
        if (subAction === 'clear') {
          saveVideos(accountKey, []);
          return api.sendMessage('✔️ Đã xoá toàn bộ video.', threadId, type);
        }
        if (subAction === 'list') {
          if (!videos.length) {
            return api.sendMessage('😵‍💫 Danh sách video trống.', threadId, type);
          }
          const lines = videos.map((video, idx) => `${idx + 1}. ${video.normalUrl}`);
          return api.sendMessage(['🎥 Danh sách video:', ...lines].join('\n'), threadId, type);
        }
        if (subAction === 'file') {
          if (args.length < 3) {
            return api.sendMessage('😵‍💫 Cú pháp: adv video file <tên-file>', threadId, type);
          }
          const rawName = args.slice(2).join(' ').trim();
          const fileVideos = loadVideoFile(rawName);
          if (!fileVideos.length) {
            return api.sendMessage('😵‍💫 File không hợp lệ hoặc trống.', threadId, type);
          }
          saveVideos(accountKey, fileVideos);
          return api.sendMessage(`✔️ Đã nạp ${fileVideos.length} video từ file.`, threadId, type);
        }
        if (subAction === 'local') {
          if (args.length < 3) {
            return api.sendMessage('😵‍💫 Cú pháp: adv video local <tên-file>', threadId, type);
          }
          const rawName = args.slice(2).join(' ').trim();
          const baseName = path.basename(rawName);
          if (!baseName) {
            return api.sendMessage('😵‍💫 Tên file không hợp lệ.', threadId, type);
          }
          const fileName = path.extname(baseName) ? baseName : `${baseName}.mp4`;
          const filePath = path.join(EXTERNAL_MESSAGE_DIR, fileName);
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return api.sendMessage(`😵‍💫 Không tìm thấy file video: ${fileName}`, threadId, type);
          }
          videos.push({
            normalUrl: `local:${fileName}`,
            localPath: filePath,
            isLocal: true,
            duration: 10_000,
            width: 720,
            height: 720
          });
          saveVideos(accountKey, videos);
          return api.sendMessage(`✔️ Đã thêm video local: ${fileName}`, threadId, type);
        }
        if (subAction === 'remove') {
          const index = parseInt(args[2], 10) - 1;
          if (!Number.isFinite(index) || index < 0 || index >= videos.length) {
            return api.sendMessage('😵‍💫 Số thứ tự không hợp lệ.', threadId, type);
          }
          const removed = videos.splice(index, 1);
          saveVideos(accountKey, videos);
          return api.sendMessage(`✔️ Đã xoá video: ${removed[0].normalUrl}`, threadId, type);
        }
        if (subAction === 'add') {
          if (args.length < 3) {
            return api.sendMessage('😵‍💫 Cú pháp: adv video add <link>', threadId, type);
          }
          const url = normalizeUrl(args.slice(2).join(' '));
          if (!url || !isValidHttpUrl(url)) {
            return api.sendMessage('😵‍💫 Link không hợp lệ.', threadId, type);
          }
          if (videos.find((item) => item.normalUrl === url)) {
            return api.sendMessage('😵‍💫 Video đã tồn tại.', threadId, type);
          }
          videos.push({ normalUrl: url, thumb: url, duration: 10_000, width: 720, height: 720 });
          saveVideos(accountKey, videos);
          return api.sendMessage(`✔️ Đã thêm video: ${url}`, threadId, type);
        }
        break;
      }

      case 'clear': {
        if (subAction !== 'all') {
          return api.sendMessage('😵‍💫 Cú pháp: adv clear all', threadId, type);
        }
        clearAllContent(accountKey);
        return api.sendMessage('✔️ Đã xoá toàn bộ nội dung auto rải (text, ảnh, video, danh thiếp).', threadId, type);
      }

      case 'time': {
        if (subAction !== 'set' || args.length < 3) {
          return api.sendMessage('😵‍💫 Cú pháp: adv time set <phút>', threadId, type);
        }
        const minutes = parseInt(args[2], 10);
        if (!Number.isFinite(minutes) || minutes < 1) {
          return api.sendMessage('😵‍💫 Phút phải là số ≥ 1.', threadId, type);
        }
        saveInterval(accountKey, minutes);
        rescheduleLoops({ api, accountKey, threadId });
        return api.sendMessage(`✔️ Đã đặt thời gian rải: ${minutes} phút`, threadId, type);
      }

      case 'disbox': {
        const disbox = loadDisbox(accountKey);
        if (!disbox.includes(threadId)) {
          disbox.push(threadId);
          saveDisbox(accountKey, disbox);
          return api.sendMessage('✔️ Đã thêm nhóm vào danh sách chặn auto rải.', threadId, type);
        }
        return api.sendMessage('😵‍💫 Nhóm đã nằm trong danh sách chặn.', threadId, type);
      }

      case 'undisbox': {
        const disbox = loadDisbox(accountKey);
        const idx = disbox.indexOf(threadId);
        if (idx !== -1) {
          disbox.splice(idx, 1);
          saveDisbox(accountKey, disbox);
          return api.sendMessage('✔️ Đã gỡ nhóm khỏi danh sách chặn.', threadId, type);
        }
        return api.sendMessage('😵‍💫 Nhóm không nằm trong danh sách chặn.', threadId, type);
      }

      case 'status': {
        const message = loadMessage(accountKey);
        const card = loadCard(accountKey);
        const interval = loadInterval(accountKey);
        const disbox = loadDisbox(accountKey);
        const images = loadImages(accountKey);
        const videos = loadVideos(accountKey);
        const threadRunning = accountState.threadLoops.get(threadId)?.running === true;
        const allRunning = accountState.allLoop?.running === true;
        const activeState = getActiveState(accountKey);
        const persistedThread = activeState.threads.includes(threadId);
        const persistedAll = activeState.runAll;
        const isThreadActive = threadRunning || persistedThread || (allRunning || persistedAll);
        const isAllActive = allRunning || persistedAll;
        const lines = [
          '📊 Trạng thái auto rải:',
          `• Nội dung: ${message ? truncate(message, 100) : 'Chưa thiết lập'}`,
          `• Danh thiếp: ${card.uid ? `UID ${card.uid}` : 'Chưa thiết lập'}`,
          `• Ảnh: ${images.length} ảnh`,
          `• Video: ${videos.length} video`,
          `• Thời gian: ${interval} phút`,
          `• Rải nhóm hiện tại: ${isThreadActive ? 'Bật' : 'Tắt'}`,
          `• Rải toàn bộ: ${isAllActive ? 'Bật' : 'Tắt'}`,
          `• Nhóm chặn: ${disbox.length}`
        ];
        if (!threadRunning && persistedThread) {
          lines.push('• (Đang chờ khởi động lại cho nhóm này)');
        }
        if (!allRunning && persistedAll) {
          lines.push('• (Auto rải tất cả sẽ khởi động sau reset)');
        }
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      case 'on': {
        if (!hasBroadcastContent(accountKey)) {
          return api.sendMessage('😵‍💫 Chưa có nội dung để rải. Dùng adv set / adv image / adv video.', threadId, type);
        }
        const disbox = loadDisbox(accountKey);
        if (disbox.includes(threadId)) {
          return api.sendMessage('⛔ Nhóm này đang bị chặn auto rải. Dùng adv undisbox để gỡ.', threadId, type);
        }
        if (accountState.threadLoops.get(threadId)?.running) {
          return api.sendMessage('⛔ Auto rải đã bật trong nhóm này.', threadId, type);
        }
        startThreadLoop({ api, accountKey, threadId });
        return api.sendMessage('✔️ Đã bật auto rải cho nhóm hiện tại.', threadId, type);
      }

      case 'all': {
        if (!hasBroadcastContent(accountKey)) {
          return api.sendMessage('😵‍💫 Chưa có nội dung để rải.', threadId, type);
        }
        if (accountState.allLoop?.running) {
          return api.sendMessage('⛔ Auto rải toàn bộ đang bật.', threadId, type);
        }
        startAllLoop({ api, accountKey });
        return api.sendMessage('✔️ Đã bật auto rải cho toàn bộ nhóm (trừ danh sách chặn).', threadId, type);
      }

      case 'off': {
        let stopped = false;
        stopped = stopAllThreadLoops(accountKey) || stopped;
        stopped = stopAllLoop(accountKey) || stopped;
        if (!stopped) {
          return api.sendMessage('😵‍💫 Auto rải chưa bật.', threadId, type);
        }
        return api.sendMessage('✔️ Đã tắt auto rải.', threadId, type);
      }

      default:
        return api.sendMessage({ msg: buildHelpText() }, threadId, type);
    }
  } catch (error) {
    console.error('[adv] lỗi xử lý command:', error);
  }
};

module.exports.handleEvent = async function ({ api, event, eventType, commandName }) {
  try {
    if (eventType !== 'group_event') return;
    await handleGroupJoinEvent({ api, event, commandName });
  } catch (error) {
    console.error('[adv] handleEvent lỗi:', error?.message || error);
  }
};

function buildHelpText() {
  return [
    '《 AUTO RẢI BONZ 》',
    '• adv set <nội dung>',
    '• adv file <tên-file>',
    '• adv card set <uid> <nội dung> | adv card clear',
    '• adv image add <link/đính kèm> | remove <số> | list | clear',
    '• adv video add <link> | remove <số> | list | clear | file <tên-file> | local <tên-file>',
    '• adv clear all',
    '• adv time set <phút>',
    '• adv disbox / adv undisbox',
    '• adv on / adv off / adv all',
    '• adv status',
  ].join('\n');
}

function resolveAccountKey(api, commandName) {
  let suffix = '';
  if (commandName) {
    const match = String(commandName).match(/adv(\d+)/i);
    if (match && match[1]) {
      suffix = `_${match[1]}`;
    }
  }
  try {
    const id = api.getCurrentUserID ? api.getCurrentUserID() : null;
    return `${String(id || 'main')}${suffix}`;
  } catch {
    return `main${suffix}`;
  }
}

function ensureAccountState(accountKey) {
  if (!accountRegistry.has(accountKey)) {
    accountRegistry.set(accountKey, {
      threadLoops: new Map(),
      allLoop: { running: false, timer: null }
    });
  }
  return accountRegistry.get(accountKey);
}

function cleanupAll() {
  for (const [accountKey] of accountRegistry.entries()) {
    stopAllLoop(accountKey);
    const accountState = accountRegistry.get(accountKey);
    if (!accountState) continue;
    for (const threadId of accountState.threadLoops.keys()) {
      stopThreadLoop(accountKey, threadId);
    }
  }
}

// ======================= STORAGE HELPERS =======================

function ensureAccountDir(accountKey) {
  const dir = path.join(DATA_ROOT, accountKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return defaultValue;
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[adv] Không thể ghi file', filePath, error?.message || error);
  }
}

function normalizeActiveState(state) {
  const normalized = { threads: [], runAll: false };
  if (state && typeof state === 'object') {
    const rawThreads = Array.isArray(state.threads) ? state.threads : [];
    const unique = new Set();
    rawThreads.forEach((item) => {
      const id = String(item || '').trim();
      if (id) unique.add(id);
    });
    normalized.threads = Array.from(unique);
    normalized.runAll = Boolean(state.runAll);
  }
  return normalized;
}

function getActiveState(accountKey) {
  if (activeStateCache.has(accountKey)) {
    return activeStateCache.get(accountKey);
  }
  const file = path.join(ensureAccountDir(accountKey), 'active.json');
  const raw = readJson(file, ACTIVE_STATE_DEFAULT);
  const normalized = normalizeActiveState(raw);
  activeStateCache.set(accountKey, normalized);
  return normalized;
}

function saveActiveState(accountKey, state) {
  const normalized = normalizeActiveState(state);
  activeStateCache.set(accountKey, normalized);
  const file = path.join(ensureAccountDir(accountKey), 'active.json');
  writeJson(file, normalized);
}

function markThreadActive(accountKey, threadId) {
  const id = String(threadId || '').trim();
  if (!id) return;
  const current = getActiveState(accountKey);
  if (current.threads.includes(id)) return;
  const updated = { ...current, threads: [...current.threads, id] };
  saveActiveState(accountKey, updated);
}

function unmarkThreadActive(accountKey, threadId) {
  const id = String(threadId || '').trim();
  if (!id) return;
  const current = getActiveState(accountKey);
  if (!current.threads.includes(id)) return;
  const updated = { ...current, threads: current.threads.filter((item) => item !== id) };
  saveActiveState(accountKey, updated);
}

function setRunAllActive(accountKey, isActive) {
  const desired = Boolean(isActive);
  const current = getActiveState(accountKey);
  if (current.runAll === desired) return;
  const updated = { ...current, runAll: desired };
  saveActiveState(accountKey, updated);
}

function listAccountKeys() {
  try {
    const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter(Boolean);
  } catch (error) {
    console.error('[adv] listAccountKeys lỗi:', error?.message || error);
    return [];
  }
}

async function handleGroupJoinEvent({ api, event }) {
  try {
    if (!api || !event) return;
    if (event.type !== GroupEventType.JOIN) return;

    const newMembers = Array.isArray(event?.data?.updateMembers) ? event.data.updateMembers : [];
    if (!newMembers.length) return;

    const botId = resolveBotId(api);
    if (!botId) return;

    const justJoined = newMembers.some((member) => String(member?.id || '') === botId);
    if (!justJoined) return;

    const accountKey = resolveAccountKey(api);
    ensureResumeForAccount(api, accountKey);

    if (!hasBroadcastContent(accountKey)) {
      return;
    }

    const disbox = new Set(loadDisbox(accountKey).map((item) => String(item)));
    const normalizedThreadId = String(event.threadId || '').trim();
    if (!normalizedThreadId || disbox.has(normalizedThreadId)) {
      return;
    }

    const started = startThreadLoop({ api, accountKey, threadId: normalizedThreadId, skipImmediate: true });
    if (started) {
      markThreadActive(accountKey, normalizedThreadId);
    }
  } catch (error) {
    console.error('[adv] handleGroupJoinEvent lỗi:', error?.message || error);
  }
}

function ensureResumeForAccount(api, accountKey) {
  if (!api || !accountKey) return;
  if (resumeInitializedAccounts.has(accountKey)) return;
  resumeInitializedAccounts.add(accountKey);

  const state = getActiveState(accountKey);
  if (!hasBroadcastContent(accountKey)) {
    return;
  }

  if (state.runAll) {
    startAllLoop({ api, accountKey, skipImmediate: true });
  }

  const disbox = new Set(loadDisbox(accountKey).map((item) => String(item)));
  for (const threadId of state.threads) {
    const normalizedId = String(threadId || '').trim();
    if (!normalizedId || disbox.has(normalizedId)) continue;
    startThreadLoop({ api, accountKey, threadId: normalizedId, skipImmediate: true });
  }
}

function resolveBotId(api) {
  try {
    const id = api?.getOwnId?.();
    if (id) return String(id);
  } catch {}
  try {
    const id = api?.getCurrentUserID?.();
    if (id) return String(id);
  } catch {}
  try {
    const ctx = api?.getContext?.();
    if (ctx) {
      if (typeof ctx.then === 'function') {
        // getContext might return promise, but we avoid async usage here
      } else {
        const id = ctx?.odId || ctx?.userId;
        if (id) return String(id);
      }
    }
  } catch {}
  return null;
}

function loadMessage(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'message.txt');
  try {
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function saveMessage(accountKey, content) {
  const file = path.join(ensureAccountDir(accountKey), 'message.txt');
  try {
    const normalized = (content || '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
    fs.writeFileSync(file, normalized, 'utf8');
  } catch (error) {
    console.error('[adv] Không thể lưu message:', error?.message || error);
  }
}

function loadCard(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'card.json');
  return readJson(file, {});
}

function saveCard(accountKey, data) {
  const file = path.join(ensureAccountDir(accountKey), 'card.json');
  writeJson(file, data || {});
}

function loadInterval(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'time.json');
  const data = readJson(file, { minutes: DEFAULT_INTERVAL_MINUTES });
  const minutes = parseInt(data.minutes, 10);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return minutes;
}

function saveInterval(accountKey, minutes) {
  const file = path.join(ensureAccountDir(accountKey), 'time.json');
  writeJson(file, { minutes });
}

function loadImages(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'images.json');
  return readJson(file, []);
}

function saveImages(accountKey, list) {
  const file = path.join(ensureAccountDir(accountKey), 'images.json');
  writeJson(file, Array.isArray(list) ? list : []);
}

function loadVideos(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'videos.json');
  return readJson(file, []);
}

function saveVideos(accountKey, list) {
  const file = path.join(ensureAccountDir(accountKey), 'videos.json');
  writeJson(file, Array.isArray(list) ? list : []);
}

function loadVideoFile(rawName) {
  const baseName = path.basename(String(rawName || '').trim());
  if (!baseName) return [];
  const fileName = path.extname(baseName) ? baseName : `${baseName}.txt`;
  const filePath = path.join(EXTERNAL_MESSAGE_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).map((line) => normalizeUrl(line)).filter(Boolean);
    return lines.map((url) => ({ normalUrl: url, thumb: url, duration: 10_000, width: 720, height: 720 }));
  } catch (error) {
    console.error('[adv] Không thể đọc file video:', error?.message || error);
    return [];
  }
}

function loadDisbox(accountKey) {
  const file = path.join(ensureAccountDir(accountKey), 'disbox.json');
  return readJson(file, []);
}

function saveDisbox(accountKey, list) {
  const file = path.join(ensureAccountDir(accountKey), 'disbox.json');
  writeJson(file, Array.isArray(list) ? list : []);
}

function hasBroadcastContent(accountKey) {
  const message = loadMessage(accountKey).trim();
  const card = loadCard(accountKey);
  const images = loadImages(accountKey);
  const videos = loadVideos(accountKey);
  return Boolean(message || (card && card.uid && card.content) || images.length || videos.length);
}

// ======================= LOOP MANAGEMENT =======================

function startThreadLoop({ api, accountKey, threadId, skipImmediate = false }) {
  const accountState = ensureAccountState(accountKey);
  const entry = accountState.threadLoops.get(threadId) || { running: false, timer: null };
  if (entry.running) {
    return false;
  }
  entry.running = true;
  accountState.threadLoops.set(threadId, entry);
  if (skipImmediate) {
    const delayMs = loadInterval(accountKey) * 60 * 1000;
    entry.timer = setTimeout(() => {
      runThreadCycle({ api, accountKey, threadId }).catch((error) => console.error('[adv] loop err:', error));
    }, delayMs);
    if (typeof entry.timer.unref === 'function') entry.timer.unref();
  } else {
    runThreadCycle({ api, accountKey, threadId }).catch((error) => {
      console.error('[adv] Thread loop error:', error);
    });
  }
  markThreadActive(accountKey, threadId);
  return true;
}

function stopThreadLoop(accountKey, threadId) {
  const accountState = ensureAccountState(accountKey);
  const entry = accountState.threadLoops.get(threadId);
  if (!entry || !entry.running) return false;
  entry.running = false;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  accountState.threadLoops.delete(threadId);
  unmarkThreadActive(accountKey, threadId);
  return true;
}

async function runThreadCycle({ api, accountKey, threadId }) {
  const accountState = ensureAccountState(accountKey);
  const entry = accountState.threadLoops.get(threadId);
  if (!entry || !entry.running) return;

  try {
    await broadcastToThread({ api, accountKey, threadId, type: ThreadType.Group });
  } catch (error) {
    console.error(`[adv] Lỗi rải nhóm ${threadId}:`, error?.message || error);
  }

  const intervalMs = loadInterval(accountKey) * 60 * 1000;
  entry.timer = setTimeout(() => {
    runThreadCycle({ api, accountKey, threadId }).catch((err) => console.error('[adv] loop err:', err));
  }, intervalMs);
  if (typeof entry.timer.unref === 'function') entry.timer.unref();
}

function startAllLoop({ api, accountKey, skipImmediate = false }) {
  const accountState = ensureAccountState(accountKey);
  if (!accountState.allLoop) accountState.allLoop = { running: false, timer: null };
  if (accountState.allLoop.running) {
    return false;
  }
  accountState.allLoop.running = true;
  if (skipImmediate) {
    const delayMs = loadInterval(accountKey) * 60 * 1000;
    accountState.allLoop.timer = setTimeout(() => {
      runAllCycle({ api, accountKey }).catch((error) => console.error('[adv] all loop error:', error));
    }, delayMs);
    if (typeof accountState.allLoop.timer?.unref === 'function') accountState.allLoop.timer.unref();
  } else {
    runAllCycle({ api, accountKey }).catch((error) => console.error('[adv] all loop error:', error));
  }
  setRunAllActive(accountKey, true);
  return true;
}

function stopAllLoop(accountKey) {
  const accountState = ensureAccountState(accountKey);
  if (!accountState.allLoop?.running) return false;
  accountState.allLoop.running = false;
  if (accountState.allLoop.timer) {
    clearTimeout(accountState.allLoop.timer);
    accountState.allLoop.timer = null;
  }
  setRunAllActive(accountKey, false);
  return true;
}

function stopAllThreadLoops(accountKey) {
  const accountState = ensureAccountState(accountKey);
  const threadIds = Array.from(accountState.threadLoops.keys());
  let stopped = false;
  for (const id of threadIds) {
    if (stopThreadLoop(accountKey, id)) {
      stopped = true;
    }
  }
  return stopped;
}

function rescheduleLoops({ api, accountKey, threadId }) {
  const accountState = ensureAccountState(accountKey);

  if (accountState.threadLoops.get(threadId)?.running) {
    stopThreadLoop(accountKey, threadId);
    startThreadLoop({ api, accountKey, threadId, skipImmediate: true });
  }

  if (accountState.allLoop?.running) {
    stopAllLoop(accountKey);
    startAllLoop({ api, accountKey, skipImmediate: true });
  }
}

async function runAllCycle({ api, accountKey }) {
  const accountState = ensureAccountState(accountKey);
  if (!accountState.allLoop?.running) return;

  try {
    const disbox = loadDisbox(accountKey);
    const groupData = await safeGetAllGroups(api);
    const groupIds = groupData ? Object.keys(groupData.gridVerMap || {}) : [];
    for (const groupId of groupIds) {
      if (!accountState.allLoop?.running) break;
      if (disbox.includes(groupId)) continue;
      await broadcastToThread({ api, accountKey, threadId: groupId, type: ThreadType.Group });
      await delay(MESSAGE_DELAY_MS);
    }
  } catch (error) {
    console.error('[adv] Lỗi rải toàn bộ:', error?.message || error);
  }

  const intervalMs = loadInterval(accountKey) * 60 * 1000;
  accountState.allLoop.timer = setTimeout(() => {
    runAllCycle({ api, accountKey }).catch((err) => console.error('[adv] all loop err:', err));
  }, intervalMs);
  if (typeof accountState.allLoop.timer?.unref === 'function') accountState.allLoop.timer.unref();
}

async function broadcastToThread({ api, accountKey, threadId, type }) {
  const message = loadMessage(accountKey).trim();
  const card = loadCard(accountKey);
  const images = loadImages(accountKey);
  const videos = loadVideos(accountKey);
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasVideos = Array.isArray(videos) && videos.length > 0;

  if (!message && !images.length && !videos.length && !(card && card.uid && card.content)) {
    return;
  }

  let messageSent = false;
  let textPending = message;

  if (hasImages) {
    const localPaths = await downloadImages(images);
    if (Array.isArray(localPaths) && localPaths.length) {
      try {
        const payload = { attachments: localPaths, msg: textPending || ' ' };
        await api.sendMessage(payload, threadId, type);
        if (textPending) textPending = '';
        messageSent = true;
      } catch (error) {
        console.error('[adv] Lỗi gửi ảnh:', error?.message || error);
      } finally {
        cleanupTempFiles(localPaths);
      }
      await delay(MESSAGE_DELAY_MS);
    }
  }

  if (hasVideos) {
    for (const video of videos) {
      if (!video?.isLocal && !isValidHttpUrl(video?.normalUrl)) {
        console.warn('[adv] Bỏ qua video do URL không hợp lệ:', video?.normalUrl);
        continue;
      }

      try {
        const payload = await ensureVideoPayload({ api, threadId, type, video });
        if (!payload) continue;

        const videoText = textPending; // caption only until consumed
        const videoResult = await api.sendVideo({
          videoUrl: payload.videoUrl,
          thumbnailUrl: payload.thumbnailUrl,
          duration: payload.duration,
          width: payload.width,
          height: payload.height,
          msg: videoText || undefined,
        }, threadId, type);
        messageSent = true;

        if (videoText) {
          textPending = '';
        }

        if (videos.length > 1) {
          await delay(MESSAGE_DELAY_MS);
        }

        if (videoResult?.messageId && typeof api.markAsRead === 'function') {
          try { await api.markAsRead(threadId, videoResult.messageId); } catch {}
        }
      } catch (error) {
        console.error('[adv] Gửi video thất bại:', error?.message || error);
      }
    }
  }

  if (!messageSent && textPending) {
    await delay(MESSAGE_DELAY_MS);
    try {
      await api.sendMessage({ msg: textPending }, threadId, type);
    } catch (error) {
      console.error('[adv] Lỗi gửi text fallback:', error?.message || error);
    }
  }

  if (card && card.uid && card.content) {
    try {
      const info = await safeGetUserInfo(api, card.uid);
      await api.sendCard({
        userId: card.uid,
        phoneNumber: card.content,
        qrCodeUrl: info?.avatar || info?.cover || undefined
      }, threadId, type);
    } catch (error) {
      console.error('[adv] Lỗi gửi danh thiếp:', error?.message || error);
    }
    await delay(MESSAGE_DELAY_MS);
  }
}

async function downloadImages(urls) {
  const result = [];
  for (const originalUrl of urls) {
    const url = normalizeUrl(originalUrl);
    if (!url) continue;
    const fileName = `img_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`;
    const filePath = path.join(TEMP_ROOT, fileName);
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: NETWORK_TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      fs.writeFileSync(filePath, response.data);
      result.push(filePath);
    } catch (error) {
      console.error('[adv] Lỗi tải ảnh:', url, error?.message || error);
    }
  }
  return result;
}

async function downloadVideoFile(originalUrl) {
  const url = normalizeUrl(originalUrl);
  if (!url) return null;

  const fileName = `vid_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`;
  const filePath = path.join(TEMP_ROOT, fileName);

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: NETWORK_TIMEOUT * 3,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    fs.writeFileSync(filePath, response.data);
    return filePath;
  } catch (error) {
    console.error('[adv] Lỗi tải video:', url, error?.message || error);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    return null;
  }
}

async function ensureVideoPayload({ api, threadId, type, video }) {
  const key = video?.normalUrl ? String(video.normalUrl) : '';
  const now = Date.now();

  if (key && videoUploadCache.has(key)) {
    const cached = videoUploadCache.get(key);
    if (cached && now - cached.cachedAt <= VIDEO_CACHE_TTL_MS) {
      return { ...cached.payload };
    }
  }

  let localPath = null;

  try {
    const prepared = await prepareVideoFile(video);
    localPath = prepared?.filePath || null;

    if (!localPath) {
      return buildRawVideoPayload(video);
    }

    const processed = await processVideo(localPath, threadId, type, api);
    if (!processed?.videoUrl) {
      return buildRawVideoPayload(video, prepared?.info);
    }

    const payload = {
      videoUrl: processed.videoUrl,
      thumbnailUrl: processed.thumbnailUrl || video.thumb || processed.videoUrl,
      duration: normalizeDuration(processed.metadata?.duration, prepared?.info?.duration || video.duration),
      width: normalizeDimension(processed.metadata?.width, prepared?.info?.width || video.width, 720),
      height: normalizeDimension(processed.metadata?.height, prepared?.info?.height || video.height, 720),
    };

    if (key) {
      videoUploadCache.set(key, { payload, cachedAt: now });
    }

    return { ...payload };
  } catch (error) {
    console.error('[adv] ensureVideoPayload lỗi:', error?.message || error);
    return buildRawVideoPayload(video);
  } finally {
    if (localPath) {
      try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (err) {
        console.warn('[adv] Không thể xoá video tạm sau ensureVideoPayload:', err?.message || err);
      }
    }
  }
}

function normalizeDuration(primary, fallback) {
  const value = Number.parseInt(primary, 10);
  if (Number.isFinite(value) && value > 0) return value;
  const fallbackNumber = Number.parseInt(fallback, 10);
  if (Number.isFinite(fallbackNumber) && fallbackNumber > 0) return fallbackNumber;
  return 10_000;
}

function normalizeDimension(primary, fallback, defaultValue) {
  const primaryNum = Number.parseInt(primary, 10);
  if (Number.isFinite(primaryNum) && primaryNum > 0) return primaryNum;
  const fallbackNum = Number.parseInt(fallback, 10);
  if (Number.isFinite(fallbackNum) && fallbackNum > 0) return fallbackNum;
  return defaultValue;
}

function buildRawVideoPayload(video, info = null) {
  if (video?.isLocal) return null;
  if (!video?.normalUrl || !isValidHttpUrl(video.normalUrl)) return null;
  return {
    videoUrl: video.normalUrl,
    thumbnailUrl: video.thumb || video.normalUrl,
    duration: normalizeDuration(null, info?.duration || video.duration),
    width: normalizeDimension(null, info?.width || video.width, 720),
    height: normalizeDimension(null, info?.height || video.height, 720),
  };
}

function cleanupTempFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (error) {
      console.error('[adv] Không thể xoá file tạm:', file, error?.message || error);
    }
  }
}

async function copyLocalVideo(sourcePath) {
  try {
    const fileName = `${Date.now()}_${Math.random().toString(16).slice(2)}${path.extname(sourcePath) || '.mp4'}`;
    const destination = path.join(TEMP_ROOT, fileName);
    await fs.promises.copyFile(sourcePath, destination);
    return destination;
  } catch (error) {
    console.error('[adv] Không thể sao chép video local:', error?.message || error);
    return null;
  }
}

async function prepareVideoFile(video) {
  if (video?.isLocal && video?.localPath && fs.existsSync(video.localPath)) {
    const copiedPath = await copyLocalVideo(video.localPath);
    if (!copiedPath) return null;
    return {
      filePath: copiedPath,
      info: {
        duration: video.duration,
        width: video.width,
        height: video.height,
        sourceUrl: video.localPath,
      },
    };
  }

  const url = video?.normalUrl;
  if (!isValidHttpUrl(url)) {
    return null;
  }

  const host = safeHostname(url);
  let downloaded = null;

  if (isTiktokHost(host)) {
    downloaded = await fetchTiktokVideo(url);
  }

  if (!downloaded) {
    const directPath = await downloadVideoFile(url);
    if (directPath) {
      downloaded = {
        filePath: directPath,
        info: {
          duration: video.duration,
          width: video.width,
          height: video.height,
          sourceUrl: url,
        },
      };
    }
  }

  return downloaded;
}

async function fetchTiktokVideo(originalUrl) {
  const resolvers = [resolveViaZeidPrimary, resolveViaZeidSecondary, resolveViaTikwm];
  let lastError = null;

  for (const resolver of resolvers) {
    try {
      const resolved = await resolver(originalUrl);
      if (!resolved || !resolved.videoUrl) continue;

      const filePath = await downloadVideoFile(resolved.videoUrl);
      if (!filePath) continue;

      return {
        filePath,
        info: {
          duration: resolved.duration || null,
          width: resolved.width || null,
          height: resolved.height || null,
          sourceUrl: originalUrl,
        },
      };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (lastError) {
    console.warn('[adv] Không thể tải video TikTok:', lastError?.message || lastError);
  }

  return null;
}

async function resolveViaZeidPrimary(url) {
  return resolveViaZeidEndpoint(PRIMARY_MEDIA_ENDPOINT, url);
}

async function resolveViaZeidSecondary(url) {
  return resolveViaZeidEndpoint(SECONDARY_MEDIA_ENDPOINT, url);
}

async function resolveViaZeidEndpoint(endpoint, url) {
  try {
    const apiUrl = `${endpoint}?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(apiUrl, { timeout: NETWORK_TIMEOUT * 2 });
    const medias = Array.isArray(data?.medias) ? data.medias : [];
    const videos = medias.filter((item) => item?.type === 'video' && item?.url);
    if (!videos.length) return null;

    const preferred = videos.find((v) => v.quality === 'hd_no_watermark')
      || videos.find((v) => v.quality === 'no_watermark')
      || videos[0];

    return {
      videoUrl: preferred.url,
      duration: preferred.duration || data?.duration || null,
      width: preferred.width || null,
      height: preferred.height || null,
    };
  } catch (error) {
    throw error;
  }
}

async function resolveViaTikwm(url) {
  try {
    const { data } = await axios.get(`${TIKWM_API_ENDPOINT}?url=${encodeURIComponent(url)}`, {
      timeout: NETWORK_TIMEOUT * 2,
    });

    if (!data || data.code !== 0 || typeof data.data !== 'object' || data.data === null) {
      return null;
    }

    const videoData = data.data;
    const preferredUrl = videoData.play || videoData.download || videoData.wmplay;
    if (!preferredUrl) return null;

    return {
      videoUrl: preferredUrl,
      duration: videoData.duration || null,
      width: videoData.width || null,
      height: videoData.height || null,
    };
  } catch (error) {
    throw error;
  }
}

function normalizeUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function isValidHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTiktokHost(hostname) {
  if (!hostname) return false;
  return TIKTOK_HOST_PATTERNS.some((pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`));
}

function normalizeAttachmentUrl(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';
  const candidates = [attachment.url, attachment.previewUrl, attachment.downloadUrl, attachment.thumbUrl];
  for (const cand of candidates) {
    if (cand) {
      return normalizeUrl(cand);
    }
  }
  return '';
}

function isBotAdmin(userId) {
  try {
    const admins = Array.isArray(global?.config?.admin_bot) ? global.config.admin_bot.map(String) : [];
    const owners = Array.isArray(global?.config?.owner_bot) ? global.config.owner_bot.map(String) : [];
    return admins.includes(String(userId)) || owners.includes(String(userId));
  } catch {
    return false;
  }
}

function truncate(text, length) {
  if (!text || text.length <= length) return text;
  return `${text.slice(0, length)}…`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGetAllGroups(api) {
  if (typeof api.getAllGroups !== 'function') return null;
  try {
    return await api.getAllGroups();
  } catch (error) {
    console.error('[adv] getAllGroups lỗi:', error?.message || error);
    return null;
  }
}

async function safeGetUserInfo(api, uid) {
  if (typeof api.getUserInfo !== 'function') return {};
  try {
    const info = await api.getUserInfo(uid);
    if (!info) return {};
    return info.changed_profiles?.[uid] || info.unchanged_profiles?.[uid] || info[uid] || {};
  } catch (error) {
    console.error('[adv] getUserInfo lỗi:', error?.message || error);
    return {};
  }
}
