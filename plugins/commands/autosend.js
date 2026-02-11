const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ThreadType } = require("zca-js");
const { processVideo } = require('../../utils/index');

const AUTOSEND_JSON_PATH = path.join(__dirname, '..', '..', 'assets', 'autosend.json');

function readAutosendJson() {
  try {
    if (!fs.existsSync(AUTOSEND_JSON_PATH)) {
      fs.mkdirSync(path.dirname(AUTOSEND_JSON_PATH), { recursive: true });
      fs.writeFileSync(AUTOSEND_JSON_PATH, '[]', 'utf8');
      return [];
    }
    const raw = fs.readFileSync(AUTOSEND_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAutosendJson(list) {
  try {
    fs.mkdirSync(path.dirname(AUTOSEND_JSON_PATH), { recursive: true });
    fs.writeFileSync(AUTOSEND_JSON_PATH, JSON.stringify(Array.isArray(list) ? list : [], null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

const intervalEnv = String(process.env.AUTOSEND_INTERVAL_MS || '').trim().toLowerCase();
const testModeEnv = String(process.env.AUTOSEND_TEST_MODE || '').trim().toLowerCase();
const USE_TEST_MODE = testModeEnv === '1' || testModeEnv === 'true' || testModeEnv === 'yes' || testModeEnv === 'on';

const USE_SCHEDULE_MODE = !USE_TEST_MODE && (intervalEnv === 'schedule' || intervalEnv === '');
const DEFAULT_RANDOM_INTERVAL_MS = 100000;
const parsedInterval = Number.parseInt(intervalEnv, 10);
const AUTOSEND_INTERVAL_MS = USE_TEST_MODE
  ? 10000
  : (USE_SCHEDULE_MODE
    ? 1000
    : Math.max(5000, Number.isFinite(parsedInterval) ? parsedInterval : DEFAULT_RANDOM_INTERVAL_MS));

// runtime controller (for quick testing)
const DEFAULT_AUTOSEND_INTERVAL_MS = AUTOSEND_INTERVAL_MS;
let autosendIntervalHandle = null;
let autosendIntervalMs = DEFAULT_AUTOSEND_INTERVAL_MS;
let autosendRunner = null;
let forceRandomMode = false;
let runtimeScheduleMode = null; // null = follow env, true = force schedule, false = force random
let autosendSourceMode = 'tiktok'; // tiktok only

function restartAutosendInterval(ms) {
  if (typeof autosendRunner !== 'function') return false;
  const next = Math.max(1000, Number(ms) || DEFAULT_AUTOSEND_INTERVAL_MS);
  try {
    if (autosendIntervalHandle) clearInterval(autosendIntervalHandle);
  } catch {}
  autosendIntervalHandle = setInterval(autosendRunner, next);
  autosendIntervalMs = next;
  return true;
}

module.exports.config = {
  name: 'autosend',
  aliases: ['lich', 'lịch', 'schedule'],
  version: '1.0.1',
  role: 1,
  author: 'ShinTHL09',
  description: 'Tự động gửi tin nhắn theo giờ đã cài và tự xóa sau 5 phút (có thể gọi bằng: bonz lịch)',
  category: "Tiện ích",
  usage: 'autosend | lich | lịch | schedule',
  cooldowns: 2
};

// Danh sách thời gian và nội dung tự động gửi
const setting = [
  {
    timer: '06:00:00 AM',
    message: [
      'Chúc mọi người buổi sáng vui vẻ😉',
      'Buổi sáng đầy năng lượng nhaa các bạn😙',
      'Dậy đi học và đi làm nào mọi người ơi😁',
      'Dậy sớm thành công rồi đó, cố lên nhé!💪'
    ]
  },
  {
    timer: '08:00:00 AM',
    message: [
      'Dậy đê ngủ như heo😒',
      'Tính nướng tới bao giờ đây😠',
      'Ai chưa dậy thì lỡ giờ học giờ làm ráng chịu đó nha🤨'
    ]
  },
  {
    timer: '11:30:00 AM',
    message: [
      'Chúc mọi người buổi trưa vui vẻ😋',
      'Cả sáng mệt mỏi rùi nghỉ ngơi nạp năng lượng nào!!😴',
      'Đến giờ ăn trưa rồi nè, đừng bỏ bữa nhé🍱'
    ]
  },
  {
    timer: '01:00:00 PM',
    message: [
      'Chúc mọi người buổi chiều vui vẻ🙌',
      'Chúc mọi người buổi chiều đầy năng lượng😼',
      'Nghỉ trưa xíu rồi bắt đầu buổi chiều nha😇'
    ]
  },
  {
    timer: '05:00:00 PM',
    message: [
      'Hết giờ làm rồi về nhà thôi mọi người 😎',
      'Chiều rồi, xả stress thôi nào 🎉',
      'Đi làm hay đi học về nhớ tắm rửa ăn uống nha 🚿🍚'
    ]
  },
  {
    timer: '07:16:00 PM',
    message: [
      'Tối rồi, nghỉ ngơi đi mọi người 🥱',
      'Tối nay có ai rảnh đi chơi hông nè? 😜',
      'Nhớ ăn tối đầy đủ nhé, giữ sức khỏe 💪'
    ]
  },
  {
    timer: '10:00:00 PM',
    message: [
      'Khuya ròi ngủ đuy😴',
      'Tới giờ lên giường ngủ rùi😇',
      'Ngủ sớm cho da đẹp dáng xinh nha💤'
    ]
  },
  {
    timer: '11:00:00 PM',
    message: [
      'Chúc mọi người ngủ ngon😴',
      'Khuya rùi ngủ ngon nhé các bạn😇',
      'Tắt điện thoại và đi ngủ thôi 📴🛌'
    ]
  },
  {
    timer: '12:00:00 AM',
    message: [
      'Bây giờ bot sẽ ngủ😗',
      'Bot ngủ đây tạm biệt mọi người😘',
      'Chúc ai còn thức một đêm an yên nhé🌙'
    ]
  }
];

const form = `➢𝐍𝐨𝐭𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧🏆
➝ Bây Giờ Là: %time_now
➝ Đây Là Tin Nhắn Tự Động
━━━━━━━━━━━
[ 𝗡𝗢̣̂𝗜 𝗗𝗨𝗡𝗚 ]  %content`;

const RANDOM_MESSAGES = setting.flatMap(item => Array.isArray(item.message) ? item.message : []).filter(Boolean);

const PRIMARY_API_ENDPOINT = 'https://api.zeidteam.xyz/media-downloader/atd2';
const FALLBACK_API_ENDPOINT = 'https://api.zeidteam.xyz/media-downloader/atd3';
const TIKWM_API_ENDPOINT = 'https://www.tikwm.com/api/';

// circuit breaker for ZeidTeam API downtime (e.g. 503)
let zeidApiDownUntil = 0;
const ZEID_DOWN_COOLDOWN_MS = (() => {
  const raw = Number.parseInt(String(process.env.AUTOSEND_ZEID_COOLDOWN_MS || '').trim(), 10);
  return Number.isFinite(raw) ? Math.max(30_000, raw) : 10 * 60 * 1000;
})();

const TIKTOK_API_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(String(process.env.AUTOSEND_TIKTOK_TIMEOUT_MS || '').trim(), 10);
  return Number.isFinite(raw) ? Math.max(5000, raw) : 45000;
})();

const TIKTOK_API_RETRY = (() => {
  const raw = Number.parseInt(String(process.env.AUTOSEND_TIKTOK_RETRY || '').trim(), 10);
  return Number.isFinite(raw) ? Math.max(0, Math.min(raw, 5)) : 2;
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(fn, label) {
  let lastError = null;
  for (let attempt = 0; attempt <= TIKTOK_API_RETRY; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const timeout = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
      const status = error?.response?.status;
      const msg = error?.message || error;
      console.warn(`[AUTOSEND] API fail${attempt ? ` (retry ${attempt}/${TIKTOK_API_RETRY})` : ''}: ${label}`, status || '', timeout ? '(timeout)' : '', msg);
      if (attempt >= TIKTOK_API_RETRY) break;
      const backoff = 600 * Math.pow(1.8, attempt);
      await sleep(backoff);
    }
  }
  throw lastError;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('Danh sách video autosend trống');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

function guessExtFromUrl(url) {
  const raw = String(url || '').trim();
  const m = raw.match(/\.([a-z0-9]{2,5})(?:\?.*)?$/i);
  if (!m) return 'mp4';
  const ext = String(m[1] || '').toLowerCase();
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'gif'].includes(ext)) return ext;
  return 'mp4';
}

function parseAutosendEntry(raw) {
  if (typeof raw === 'string') {
    const normalized = raw.trim();
    const isDirect = /\.(mp4|mov|m4v|webm|mkv|gif)(\?.*)?$/i.test(normalized);
    return {
      type: isDirect ? 'direct' : 'tiktok',
      url: normalized,
      title: '',
      author: ''
    };
  }

  if (typeof raw === 'object' && raw !== null) {
    const type = String(raw.type || 'tiktok').toLowerCase();
    const url = typeof raw.url === 'string' ? raw.url : null;

    if (!url) {
      throw new Error('Autosend entry thiếu URL');
    }

    return {
      type,
      url,
      title: typeof raw.title === 'string' ? raw.title : '',
      author: typeof raw.author === 'string' ? raw.author : ''
    };
  }

  throw new Error('Autosend entry không hợp lệ');
}

let AUTOSEND_ENTRIES = [];
let TIKTOK_AUTOSEND_ENTRIES = [];
let DIRECT_AUTOSEND_ENTRIES = [];

function reloadAutosendEntries() {
  const autosendVideos = readAutosendJson();
  AUTOSEND_ENTRIES = autosendVideos.reduce((list, raw) => {
    try {
      list.push(parseAutosendEntry(raw));
    } catch (err) {
      console.warn('[AUTOSEND] Bỏ qua entry autosend không hợp lệ:', err?.message || err);
    }
    return list;
  }, []);
  TIKTOK_AUTOSEND_ENTRIES = AUTOSEND_ENTRIES.filter((e) => e?.type === 'tiktok' && e?.url);
  DIRECT_AUTOSEND_ENTRIES = AUTOSEND_ENTRIES.filter((e) => e?.type === 'direct' && e?.url);
}

reloadAutosendEntries();

function isLikelyTikTokUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  return /tiktok\.com\//i.test(s) || /vt\.tiktok\.com\//i.test(s);
}

async function sendVideoToThread({ api, threadId, threadType, msg, downloadedVideo, tempFilePath }) {
  // Prefer sendVideo if available.
  if (downloadedVideo) {
    const duration = downloadedVideo?.info?.duration || downloadedVideo?.metadata?.duration;
    const width = downloadedVideo?.metadata?.width;
    const height = downloadedVideo?.metadata?.height;

    if (typeof api.sendVideo === 'function' && downloadedVideo.videoUrl && downloadedVideo.thumbnailUrl) {
      const payload = {
        msg,
        videoUrl: downloadedVideo.videoUrl,
        thumbnailUrl: downloadedVideo.thumbnailUrl,
        duration,
        ttl: 300000
      };
      if (width) payload.width = width;
      if (height) payload.height = height;
      await api.sendVideo(payload, threadId, threadType);
      return true;
    }
  }

  // Fallback: send local file as attachment (works for many setups).
  if (tempFilePath && fs.existsSync(tempFilePath)) {
    await api.sendMessage({ msg, attachments: [tempFilePath], ttl: 300000 }, threadId, threadType);
    return true;
  }

  await api.sendMessage({ msg, ttl: 300000 }, threadId, threadType);
  return false;
}

function createTempMediaPath(tempDir, ext = 'mp4') {
  const safeExt = String(ext || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  return path.join(tempDir, `autosend_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`);
}

async function downloadDirectEntry(entry, tempDir) {
  const ext = guessExtFromUrl(entry.url);
  const filePath = createTempMediaPath(tempDir, ext);
  await downloadStreamToFile(entry.url, filePath);

  return {
    filePath,
    info: {
      title: entry.title || '',
      author: entry.author || '',
      sourceUrl: entry.url,
      duration: null
    }
  };
}

async function downloadStreamToFile(url, destinationPath) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destinationPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return destinationPath;
}

async function callMediaApi(endpoint, url) {
  const apiUrl = `${endpoint}?url=${encodeURIComponent(url)}`;
  return requestWithRetry(
    () => axios.get(apiUrl, {
      timeout: TIKTOK_API_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }),
    apiUrl
  );
}

function extractVideoFromZeidResponse(data) {
  const medias = Array.isArray(data?.medias) ? data.medias : [];
  const videos = medias.filter(item => item?.type === 'video' && item?.url);

  if (videos.length === 0) {
    return null;
  }

  const preferredVideo = videos.find(v => v.quality === 'hd_no_watermark')
    || videos.find(v => v.quality === 'no_watermark')
    || videos[0];

  const authorName = typeof data?.author === 'string'
    ? data.author
    : typeof data?.author === 'object' && data.author !== null
      ? (data.author.nickname || data.author.unique_id || '')
      : '';

  return {
    preferredVideo,
    info: {
      title: data?.title || '',
      author: authorName,
      duration: preferredVideo?.duration || data?.duration || null
    }
  };
}

function extractVideoFromTikwmResponse(data) {
  if (!data || data.code !== 0 || typeof data.data !== 'object' || data.data === null) {
    return null;
  }

  const videoData = data.data;
  const preferredUrl = videoData.play || videoData.download || videoData.wmplay;

  if (!preferredUrl) {
    return null;
  }

  const authorName = typeof videoData.author === 'object' && videoData.author !== null
    ? (videoData.author.nickname || videoData.author.unique_id || '')
    : '';

  return {
    preferredVideo: {
      url: preferredUrl,
      quality: 'no_watermark',
      duration: videoData.duration || null
    },
    info: {
      title: videoData.title || '',
      author: authorName,
      duration: videoData.duration || null
    }
  };
}

async function fetchAutosendVideo(tempDir) {
  const pool = TIKTOK_AUTOSEND_ENTRIES;
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('Autosend: Không có link TikTok trong assets/autosend.json');
  }

  const entry = pickRandom(pool);

  if (entry.type === 'direct') {
    return downloadDirectEntry(entry, tempDir);
  }

  let responseData = null;
  let lastError = null;

  const canUseZeid = Date.now() >= zeidApiDownUntil;
  const endpoints = canUseZeid ? [PRIMARY_API_ENDPOINT, FALLBACK_API_ENDPOINT] : [];

  for (const endpoint of endpoints) {
    try {
      const { data } = await callMediaApi(endpoint, entry.url);
      responseData = extractVideoFromZeidResponse(data);
      if (responseData) {
        break;
      }
    } catch (error) {
      lastError = error;

      const status = error?.response?.status;
      if (Number(status) === 503) {
        zeidApiDownUntil = Date.now() + ZEID_DOWN_COOLDOWN_MS;
        console.warn(`[AUTOSEND] ZeidTeam API đang 503, tạm ngưng ${Math.round(ZEID_DOWN_COOLDOWN_MS / 1000)}s và chuyển sang TikWM.`);
        break;
      }
      continue;
    }
  }

  if (!responseData) {
    try {
      const tikwmUrl = `${TIKWM_API_ENDPOINT}?url=${encodeURIComponent(entry.url)}`;
      const { data } = await requestWithRetry(
        () => axios.get(tikwmUrl, {
          timeout: TIKTOK_API_TIMEOUT_MS,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }),
        tikwmUrl
      );
      responseData = extractVideoFromTikwmResponse(data);
    } catch (error) {
      lastError = error;
    }
  }

  if (!responseData) {
    if (lastError) {
      console.warn('[AUTOSEND] Các API TikTok thất bại. Lỗi cuối:', lastError?.message || lastError);
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Không tìm thấy video hợp lệ');
  }

  const filePath = createTempMediaPath(tempDir, 'mp4');

  await downloadStreamToFile(responseData.preferredVideo.url, filePath);

  return {
    filePath,
    info: {
      ...responseData.info,
      sourceUrl: entry.url
    }
  };
}

module.exports.onLoad = async function ({ api, Threads }) {
  const tempDir = path.join(__dirname, 'temp');

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const scheduleSentToday = Object.create(null);
  let lastRandomSentTimestamp = 0;

  autosendRunner = autosend;
  autosendIntervalMs = AUTOSEND_INTERVAL_MS;
  if (autosendIntervalHandle) {
    try { clearInterval(autosendIntervalHandle); } catch {}
    autosendIntervalHandle = null;
  }
  autosendIntervalHandle = setInterval(autosend, AUTOSEND_INTERVAL_MS);

  async function autosend() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let randomMessage;
    let timeLabel = timeString;

    const effectiveScheduleMode = runtimeScheduleMode === null ? USE_SCHEDULE_MODE : runtimeScheduleMode;

    if (effectiveScheduleMode && !forceRandomMode) {
      const todayKey = now.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh'
      });

      const matched = setting.find(item => item.timer === now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
      if (!matched) return;

      if (scheduleSentToday[matched.timer] === todayKey) return;
      scheduleSentToday[matched.timer] = todayKey;

      randomMessage = matched.message[Math.floor(Math.random() * matched.message.length)];
      timeLabel = matched.timer;
    } else {
      const pool = RANDOM_MESSAGES.length ? RANDOM_MESSAGES : ['Have a great day!'];
      randomMessage = pool[Math.floor(Math.random() * pool.length)];
      lastRandomSentTimestamp = Date.now();
    }

    const msg = form
      .replace(/%time_now/g, timeLabel)
      .replace(/%content/g, randomMessage);

    const allGroups = await api.getAllGroups();
    const allBoxIDs = Object.keys(allGroups.gridVerMap);
    const targetThreads = [];

    for (const groupId of allBoxIDs) {
      const thread = await Threads.getData(groupId);
      if (thread.data.auto_send) {
        targetThreads.push(thread);
      }
    }

    if (targetThreads.length === 0) {
      return;
    }

    let downloadedVideo = null;

    try {
      downloadedVideo = await fetchAutosendVideo(tempDir);
    } catch (error) {
      console.error('[AUTOSEND] Không thể tải video autosend:', error.message);
    }

    const metaLines = [];
    if (downloadedVideo?.info?.title) metaLines.push(`Title: ${downloadedVideo.info.title}`);
    if (downloadedVideo?.info?.author) metaLines.push(`Author: ${downloadedVideo.info.author}`);
    const enhancedMessage = metaLines.length > 0 ? `${msg}
${metaLines.join('\r\n')}` : msg;

    let sendVideoSucceeded = false;

    // IMPORTANT: uploadAttachment/videoUrl often scoped per thread, so cache by threadId
    const uploadedVideoByThread = new Map();

    for (const thread of targetThreads) {
      try {
        let uploaded = null;
        const filePath = downloadedVideo?.filePath || null;
        const isGif = filePath ? /\.gif$/i.test(filePath) : false;

        if (filePath && !isGif) {
          if (!fs.existsSync(filePath)) {
            console.warn('[AUTOSEND] File video không tồn tại để xử lý:', filePath);
          } else {
            uploaded = uploadedVideoByThread.get(thread.threadId) || null;
            if (!uploaded) {
              // utils.processVideo() will delete its input file after uploading.
              // To allow sending to multiple threads, create a per-thread copy.
              let copyPath = null;
              try {
                copyPath = createTempMediaPath(tempDir, 'mp4');
                fs.copyFileSync(filePath, copyPath);
              } catch (copyErr) {
                console.warn('[AUTOSEND] Không thể tạo bản sao video để upload:', copyErr?.message || copyErr);
                copyPath = null;
              }

              if (copyPath && fs.existsSync(copyPath)) {
                try {
                  uploaded = await processVideo(copyPath, thread.threadId, ThreadType.Group);
                  if (uploaded) uploadedVideoByThread.set(thread.threadId, uploaded);
                } catch (processError) {
                  console.error('[AUTOSEND] Lỗi xử lý video:', processError.message);
                  uploaded = null;
                }
              }
            }
          }
        }

        // If we uploaded via processVideo then local file may be deleted by utils.processVideo
        // so only use local attachment fallback when upload is not performed.
        const fallbackLocalPath = uploaded ? null : filePath;

        const ok = await sendVideoToThread({
          api,
          threadId: thread.threadId,
          threadType: ThreadType.Group,
          msg: enhancedMessage,
          downloadedVideo: uploaded,
          tempFilePath: fallbackLocalPath
        });
        if (ok && filePath) sendVideoSucceeded = true;
      } catch (err) {
        console.log(`Không gửi được tới threadId ${thread.threadId}: ${err.message}`);
        continue;
      }
    }

    if (!sendVideoSucceeded && downloadedVideo?.info?.sourceUrl) {
      const fallbackMsg = `${enhancedMessage}\nKh\u00F4ng t\u1EA3i \u0111\u01B0\u1EE3c video, xem link g\u1ED1c: ${downloadedVideo.info.sourceUrl}`;

      for (const thread of targetThreads) {
        try {
          await api.sendMessage({
            msg: fallbackMsg,
            ttl: 300000
          }, thread.threadId, ThreadType.Group);
        } catch (err) {
          console.log(`Không gửi fallback tới threadId ${thread.threadId}: ${err.message}`);
        }
      }
    }

    // Note: processVideo may delete filePath itself.
    if (downloadedVideo?.filePath) {
      try {
        if (fs.existsSync(downloadedVideo.filePath)) {
          fs.unlinkSync(downloadedVideo.filePath);
        }
      } catch (cleanupError) {
        console.error('[AUTOSEND] Lỗi khi xoá video tạm:', cleanupError.message);
      }
    }
  }
};

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }

  if (type === ThreadType.User) return api.sendMessage("❌ Lệnh chỉ có thể dùng trong nhóm", threadId, type);

  async function setAutoSend(id, status) {
    const thread = await Threads.getData(id);
    const data = thread.data;
    data.auto_send = status;
    await Threads.setData(id, data);
    return { id, status };
  }

  async function toggleAutoSend(id) {
    const thread = await Threads.getData(id);
    const data = thread.data;
    data.auto_send = !data.auto_send;
    await Threads.setData(id, data);
    return { id, status: data.auto_send };
  }

  const sub = String(args[0] || '').toLowerCase();

  if (sub === 'list') {
    reloadAutosendEntries();
    const list = TIKTOK_AUTOSEND_ENTRIES.map((e) => e.url).slice(0, 20);
    const body = list.length
      ? `AUTOSEND TIKTOK LIST (show ${list.length}/${TIKTOK_AUTOSEND_ENTRIES.length})\n` + list.map((u, i) => `${i + 1}. ${u}`).join('\n')
      : 'AUTOSEND TIKTOK LIST: EMPTY\nDung: autosend add <linkTikTok>';
    return api.sendMessage(body, threadId, type);
  }

  if (sub === 'add') {
    const url = String(args.slice(1).join(' ') || '').trim();
    if (!isLikelyTikTokUrl(url)) {
      return api.sendMessage('ERROR: Link khong hop le. Chi nhan link TikTok (tiktok.com / vt.tiktok.com).', threadId, type);
    }
    const raw = readAutosendJson();
    const exists = raw.some((x) => String(x?.url || x).trim() === url);
    if (!exists) raw.push(url);
    const ok = writeAutosendJson(raw);
    reloadAutosendEntries();
    if (!ok) return api.sendMessage('ERROR: Khong ghi duoc assets/autosend.json', threadId, type);
    return api.sendMessage(`OK: Da them TikTok link. Tong: ${TIKTOK_AUTOSEND_ENTRIES.length}`, threadId, type);
  }

  if (sub === 'clear') {
    const ok = writeAutosendJson([]);
    reloadAutosendEntries();
    if (!ok) return api.sendMessage('ERROR: Khong ghi duoc assets/autosend.json', threadId, type);
    return api.sendMessage('OK: Da xoa toan bo danh sach autosend TikTok.', threadId, type);
  }

  if (sub === 'source' || sub === 'src') {
    autosendSourceMode = 'tiktok';
    return api.sendMessage('OK: autosend chi gui video TikTok (tiktok only).', threadId, type);
  }

  if (sub === 'test') {
    forceRandomMode = true;
    runtimeScheduleMode = null;
    const ok = restartAutosendInterval(10000);
    if (!ok) {
      return api.sendMessage('ERROR: autosend chưa khởi tạo xong (thử restart bot).', threadId, type);
    }
    try {
      await autosendRunner();
    } catch (e) {
      console.warn('[AUTOSEND] test trigger error:', e?.message || e);
    }
    return api.sendMessage(`OK: autosend test mode 10s/lan. (interval=${autosendIntervalMs}ms)`, threadId, type);
  }

  if (sub === 'normal' || sub === 'default') {
    forceRandomMode = false;
    runtimeScheduleMode = true;
    const ok = restartAutosendInterval(1000);
    if (!ok) {
      return api.sendMessage('ERROR: autosend chưa khởi tạo xong (thử restart bot).', threadId, type);
    }
    return api.sendMessage(`OK: autosend ve che do theo gio da setup. (interval=${autosendIntervalMs}ms)`, threadId, type);
  }

  if (sub === 'schedule') {
    forceRandomMode = false;
    runtimeScheduleMode = true;
    const ok = restartAutosendInterval(1000);
    if (!ok) {
      return api.sendMessage('ERROR: autosend chưa khởi tạo xong (thử restart bot).', threadId, type);
    }
    return api.sendMessage(`OK: autosend chay theo gio da setup. (interval=${autosendIntervalMs}ms)`, threadId, type);
  }

  if (sub === 'random') {
    forceRandomMode = false;
    runtimeScheduleMode = false;
    const ok = restartAutosendInterval(DEFAULT_AUTOSEND_INTERVAL_MS);
    if (!ok) {
      return api.sendMessage('ERROR: autosend chưa khởi tạo xong (thử restart bot).', threadId, type);
    }
    return api.sendMessage(`OK: autosend chay ngau nhien (khong theo gio). (interval=${autosendIntervalMs}ms)`, threadId, type);
  }

  if (sub === 'status' || sub === 'info') {
    const effectiveScheduleMode = runtimeScheduleMode === null ? USE_SCHEDULE_MODE : runtimeScheduleMode;
    const mode = autosendIntervalMs === 10000
      ? 'test'
      : (effectiveScheduleMode ? 'schedule' : 'random');
    let enabled = null;
    try {
      const thread = await Threads.getData(threadId);
      enabled = !!thread?.data?.auto_send;
    } catch {}
    return api.sendMessage(
      `AUTOSEND STATUS\n- mode: ${mode}${forceRandomMode ? ' (forceRandom)' : ''}\n- interval: ${autosendIntervalMs}ms\n- default: ${DEFAULT_AUTOSEND_INTERVAL_MS}ms\n- schedule_override: ${runtimeScheduleMode === null ? 'env' : String(runtimeScheduleMode)}\n- source: ${autosendSourceMode}\n- tiktok_entries: ${TIKTOK_AUTOSEND_ENTRIES.length}\n- direct_entries: ${DIRECT_AUTOSEND_ENTRIES.length}\n- this_group_enabled: ${enabled === null ? 'unknown' : String(enabled)}`,
      threadId,
      type
    );
  }

  if (sub === 'on') {
    forceRandomMode = false;
    runtimeScheduleMode = true;
    restartAutosendInterval(1000);
    const result = await setAutoSend(threadId, true);
    return api.sendMessage(
      `📩 Autosend đã được bật ✅ cho nhóm này. (che do: theo gio da setup)`,
      result.id,
      type
    );
  }

  if (sub === 'off') {
    const result = await setAutoSend(threadId, false);
    return api.sendMessage(
      `📩 Autosend đã được tắt ❌ cho nhóm này.`,
      result.id,
      type
    );
  }

  if (sub === "all") {
    const mode = args[1];
    if (mode !== "on" && mode !== "off") {
      return api.sendMessage(
        `❌ Vui lòng dùng đúng cú pháp: autosend all [on|off]`,
        threadId, type
      );
    }

    const statusToSet = mode === "on";
    const allGroups = await api.getAllGroups();
    const allBoxIDs = Object.keys(allGroups.gridVerMap);
    const results = [];

    for (const boxId of allBoxIDs) {
      const result = await setAutoSend(boxId, statusToSet);
      results.push(result);
    }

    return api.sendMessage(
      `✅ Đã ${statusToSet ? "bật" : "tắt"} autosend cho ${results.length} nhóm.`,
      threadId, type
    );
  }

  const result = await toggleAutoSend(threadId);
  return api.sendMessage(
    `📩 Autosend đã được ${result.status ? "bật ✅" : "tắt ❌"} cho nhóm này.`,
    threadId, type
  );
};


