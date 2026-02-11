// Safe Mode utility for moderating messages
// Platform: Zalo (zca-js)
const fs = require('fs');
const path = require('path');

let safeModeEnabled = true; // default ON; có thể toggle bằng setSafeMode
let selfUid = null;         // nếu biết UID bot thì setSelfUid để bỏ qua outbox
const THREAD_SAFE = new Map(); // threadId -> boolean (true:on, false:off)

// ======================== DANH SÁCH GỐC (giữ nguyên) ========================
const baseForbidden = [
  'sex', 'xxx', 'nude', 'porn',
  'https://zalo.me/g/', 'http://zalo.me/g/'
];

const forbiddenLinks = [
  // Zalo groups & invite
  'zalo.me/g/', 'chat.zalo.me/join/', 'zaloapp.com/g/', 'oa.zalo.me/',
  // Discord
  'discord.gg/', 'discord.com/invite/', 'discordapp.com/invite/',
  // Telegram
  't.me/', 'telegram.me/', 'telegram.dog/',
  // Facebook groups/pages
  'facebook.com/groups/', 'm.facebook.com/groups/', 'fb.com/groups/', 'facebook.com/events/',
  // Porn & NSFW sites
  'pornhub.com','xvideos.com','xnxx.com','redtube.com','youporn.com','xhamster.com','brazzers.com',
  'spankbang.com','youjizz.com','porntube.com','exhamster.com','hqporner.com','beeg.com','tube8.com',
  'sunporno.com','thumbzilla.com','fapdu.com','xkeezmovies.com','keezmovies.com','xtube.com',
  'x-art.com','porn.com','porndig.com','pornhd.com','porn300.com','tnaflix.com','drtuber.com',
  'pornid.com','efukt.com','motherless.com','rule34','e621.net','nhentai.net','gelbooru.com',
  'danbooru.donmai.us','sankakucomplex.com','chan.sankakucomplex.com','pixiv.net/r18','javhub','javhd',
  'javmost','javfree','hentaivn','anime-pictures.net/r18','f95zone.to',
  // OnlyFans & content paywall NSFW
  'onlyfans.com','fansly.com','manyvids.com','myfreecams.com','chaturbate.com',
  // Live cam & escort
  'livejasmin.com','bongacams.com','stripchat.com','cam4.com','camsoda.com','imlive.com',
  'escort','booking-escort','callgirl','call-girl','sugarbaby','sugar-baby',
  // Link rút gọn/scam
  'bit.ly/','tinyurl.com/','goo.gl/','shorturl.at/','cutt.ly/','shorte.st/','ouo.io/','adf.ly/',
  'is.gd/','t.ly/','rebrand.ly/','s.id/','v.gd/','rb.gy/',
  // Chợ đen
  'darkweb','onion','tor2web','thehiddenwiki',
  // Cờ bạc/nhà cái
  'fb88','m88','w88','188bet','bong88','letou','dafabet','fun88','vn88','sv388','kubet',
  'hi88','jun88','okvip','oxbet','789bet','nhacaiuytin','nhacai','b52','nohu','banhbaotv',
  // Chat 18+
  'omegle.com','ome.tv','chatroulette.com','stripchat',
  // Chia sẻ file ẩn danh
  'anonfiles.com','megaup.net','dropapk.to','dropapk.com','uploadboy.com','katfile.com',
  'rapidgator.net','nitroflare.com','turbobit.net','filejoker.net',
  // Việt hóa/diễn đàn
  'clipnong','phimsex','sexvl','viet69','sieudam','phim18','sexviet','topsex',
  // Khác
  'line.me/R/ti/g/','chat.whatsapp.com/','invite.whatsapp.com/','wechat.com/invite',
  'kakao.com/talk/','vk.com/club','vk.com/join',
];

const additionalForbidden = [
  'pornhub','xvideos','xnxx','redtube','youporn','xhamster','brazzers','brazzer',
  'hentai','incest','rape','raped','bestiality','zoophilia','footjob','handjob',
  'blowjob','cum','creampie','anal','bdsm','bondage','deepthroat','milf','teen',
  'loli','jav','sex tape','naked','nudes','onlyfans','only fans','fap','fapping',
  'erotic','camgirl','cam girl','camsex','escort','prostitute','hooker','strip',
  'stripper','stripclub','strip club','lust','orgasm','sexting','softcore','hardcore',
  'nsfw','adult','xxx video','xvideo','xham',
  // TV/VI
  'phim sex','anh nude','ảnh nude','khoe hàng','khoe hang','ảnh nóng','anh nong',
  'clip nóng','clip sex','hiếp','hiep','hiếp dâm','hiep dam','dâm','dam','dâm dục','dam duc',
  'địt','dit','đjt','djịt','đụ','du','xoạc','xoac','nứng','nung','sướng','suong',
  'lồn','lon','âm đạo','am dao','cặc','cac','buồi','buoi','bú cu','bu cu','bú vú','bu vu',
  'bú liếm','bu liem','sờ vú','so vu','sờ mông','so mong','liếm','liem','đồ má','do ma',
  'đĩ','con đĩ','di~','điếm','diem','gái gọi','gai goi','gái dịch vụ','gai dich vu',
  'kích dục','kich duc','khiêu dâm','khieu dam','xx video','sex chat','sexchat','sex link',
  'rape porn','child porn','underage','lolicon','shotacon','pegging','rimming','voyeur',
  'exhibitionist','gangbang','threesome','foursome','orgy','cumshot','facial','bukkake',
  'spanking','choke','choking','breast','boobs','tits','nipples','pussy','vagina','penis',
  'dick','cock','blow job','hand job','foot job',
  // Bổ sung theo yêu cầu
  'đm','dm','sexx','sexxx',
  // Xúc phạm/miệt thị (VI)
  'm là cái thá gì','m la cai tha gi','mày là cái thá gì','may la cai tha gi',
  'bot là cái thá gì','bot la cai tha gi','m là ai','may la ai','mày là ai','may la ai',
  'óc chó','oc cho','óc lợn','oc lon','đồ óc chó','do oc cho','đồ con chó','do con cho',
  'thằng ngu','thang ngu','con ngu','do ngu','ngu như bò','ngu nhu bo',
  'câm mồm','cam mom','cút','cut di','cút đi','cot di','cot',
  'đồ mất dạy','do mat day','vô học','vo hoc','láo toét','lao toét','hỗn láo','hon lao',
  'chửi','chui','sỉ vả','si va','lăng mạ','lang ma',
];

// ======================== TIỆN ÍCH ========================
function normalize(str) {
  try { return String(str || '').toLowerCase(); } catch { return ''; }
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Tách URL (có và không có scheme)
function extractUrls(rawText) {
  const text = rawText || '';
  const urls = new Set();
  const scheme = /https?:\/\/[^\s)]+/gi;
  const bare = /(discord\.gg\/\S+|discord(?:app)?\.com\/invite\/\S+|t\.me\/\S+|telegram\.(?:me|dog)\/\S+|zalo\.me\/g\/\S+|chat\.zalo\.me\/join\/\S+|facebook\.com\/groups\/\S+|m\.facebook\.com\/groups\/\S+|fb\.com\/groups\/\S+|line\.me\/R\/ti\/g\/\S+|chat\.whatsapp\.com\/\S+|invite\.whatsapp\.com\/\S+|vk\.com\/(?:club|join)\/\S+)/gi;
  for (const m of text.matchAll(scheme)) urls.add(m[0]);
  for (const m of text.matchAll(bare)) urls.add(m[0]);
  return [...urls].map(u => u.toLowerCase());
}

// Tách 2 loại kiểm duyệt: "từ/cụm từ" & "link"
const WORD_BLOCKLIST = (() => {
  // bỏ các mẫu http(s) khỏi word list
  const baseWords = baseForbidden.filter(v => !/^https?:\/\//i.test(v));
  return [...new Set([...baseWords, ...additionalForbidden])];
})();
const LINK_BLOCKLIST = (() => {
  const httpFromBase = baseForbidden.filter(v => /^https?:\/\//i.test(v));
  return [...new Set([...httpFromBase, ...forbiddenLinks])].map(s => s.toLowerCase());
})();

// User extras (runtime + persisted)
let USER_WORDS = [];
let USER_LINKS = [];

// build regex cho WORD_BLOCKLIST theo ranh giới từ (mutable)
let WORD_REGEXES = [];
function rebuildWordRegexes() {
  const all = [...new Set([...WORD_BLOCKLIST, ...USER_WORDS])];
  WORD_REGEXES = all.map(w => {
    const pat = escapeRegExp(String(w).toLowerCase()).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${pat}([^a-z0-9]|$)`, 'i');
  });
}
rebuildWordRegexes();

// Persistence for user extras
const DATA_DIR = path.join(__dirname, '../../data');
const EXTRA_FILE = path.join(DATA_DIR, 'bonz_forbidden.json');
function ensureDataDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
function loadExtras() {
  try {
    ensureDataDir();
    if (!fs.existsSync(EXTRA_FILE)) return;
    const raw = fs.readFileSync(EXTRA_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.words)) USER_WORDS = [...new Set(obj.words.map(normalize))];
    if (Array.isArray(obj.links)) USER_LINKS = [...new Set(obj.links.map(normalize))];
    rebuildWordRegexes();
  } catch {}
}
function saveExtras() {
  try {
    ensureDataDir();
    const payload = { words: USER_WORDS, links: USER_LINKS };
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}
loadExtras();

function toMessageObject(event) {
  const { threadId, type, data } = event || {};
  const text = data?.content || '';
  const msgType = data?.msgType || '';
  const isImage = (
    msgType === 'IMAGE' ||
    msgType === 'image' ||
    data?.propertyExt?.attachments?.some?.(a => a?.type === 'image')
  );
  const isSensitive = !!data?.isSensitive;
  const sender = { id: data?.uidFrom, name: data?.senderName || data?.authorName || '' };
  const message = { id: data?.msgId || data?.cliMsgId, text, type: isImage ? 'image' : 'text', isSensitive };
  const meta = { isOutbox: !!(data?.isOutbox || data?.direction === 'OUT' || data?.isSelf) };
  return { threadId, type, sender, message, meta };
}

// Siêu nhanh - xóa ngay không chờ gì cả
function deleteMessageFast(api, event) {
  const { threadId, type, data } = event || {};
  // Fire-and-forget - siêu nhanh
  setImmediate(() => {
    api.deleteMessage({
      threadId,
      type,
      data: {
        cliMsgId: data?.cliMsgId,
        msgId: data?.msgId,
        uidFrom: data?.uidFrom
      }
    }, false).catch(() => {});
  });
}

// Cache kết quả kiểm tra để tăng tốc
const CHECK_CACHE = new Map();
const CACHE_SIZE = 1000;

// Thống kê vi phạm: userId -> { name, count, lastViolation }
const VIOLATION_STATS = new Map();

// Ghi nhận vi phạm
function recordViolation(sender) {
  if (!sender?.id) return;
  const uid = String(sender.id);
  const name = sender.name || 'Unknown';
  const now = Date.now();
  
  if (VIOLATION_STATS.has(uid)) {
    const stats = VIOLATION_STATS.get(uid);
    stats.count++;
    stats.lastViolation = now;
    stats.name = name; // Cập nhật tên mới nhất
  } else {
    VIOLATION_STATS.set(uid, {
      name,
      count: 1,
      lastViolation: now
    });
  }
}

function findMatchedKeyword(text) {
  const t = normalize(text);
  if (!t) return null;
  
  // Cache hit - siêu nhanh
  if (CHECK_CACHE.has(t)) return CHECK_CACHE.get(t);

  let result = null;

  // 1) Kiểm tra URL trước - tối ưu với early return
  const urls = extractUrls(t);
  if (urls.length > 0) {
    for (const u of urls) {
      for (const needle of LINK_BLOCKLIST) {
        if (u.includes(needle)) {
          result = { type: 'link', keyword: needle, sample: u };
          break;
        }
      }
      if (result) break;
    }
  }

  // 2) Kiểm tra từ/cụm từ nếu chưa match link
  if (!result) {
    for (const rx of WORD_REGEXES) {
      if (rx.test(t)) {
        result = { type: 'word', keyword: rx.source, sample: t.slice(0, 120) };
        break;
      }
    }
  }

  // Cache kết quả (giới hạn size để không tràn RAM)
  if (CHECK_CACHE.size >= CACHE_SIZE) {
    const firstKey = CHECK_CACHE.keys().next().value;
    CHECK_CACHE.delete(firstKey);
  }
  CHECK_CACHE.set(t, result);

  return result;
}

async function checkSafeMode({ api, event }) {
  // SIÊU NHANH - kiểm tra tối thiểu
  if (!event?.threadId || !api) return false;

  const { threadId } = event;
  const threadIdStr = String(threadId);
  
  // Kiểm tra enabled nhanh
  const hasThreadCfg = THREAD_SAFE.has(threadIdStr);
  const effectiveEnabled = hasThreadCfg ? THREAD_SAFE.get(threadIdStr) : safeModeEnabled;
  if (!effectiveEnabled) return false;

  const { message, sender, meta } = toMessageObject(event);

  // SIÊU NHANH - bỏ qua outbox/self
  if (meta.isOutbox) return false;
  if (selfUid && sender?.id && String(sender.id) === String(selfUid)) return false;

  // SIÊU NHANH - bỏ qua admin/owner (cache config)
  const cfg = global?.config;
  if (cfg && sender?.id) {
    const uid = String(sender.id);
    const admins = cfg.admin_bot;
    const owners = cfg.owner_bot;
    if ((Array.isArray(admins) && admins.includes(uid)) || 
        (Array.isArray(owners) && owners.includes(uid))) {
      return false;
    }
  }

  // Chỉ kiểm tra text/images
  if (message.type !== 'text' && message.type !== 'image') return false;

  if (message.type === 'text') {
    const hit = findMatchedKeyword(message.text);
    if (hit) {
      // Ghi nhận vi phạm
      recordViolation(sender);
      // SIÊU NHANH - xóa ngay lập tức
      deleteMessageFast(api, event);
      return true;
    }
  }

  // Ảnh có cờ nhạy cảm (nếu upstream gắn isSensitive)
  if (message.type === 'image' && message.isSensitive) {
    // Ghi nhận vi phạm ảnh
    recordViolation(sender);
    // SIÊU NHANH - xóa ảnh ngay lập tức
    deleteMessageFast(api, event);
    return true;
  }

  return false;
}

module.exports = {
  checkSafeMode,
  setSafeMode: (enabled) => { safeModeEnabled = !!enabled; },
  getSafeMode: () => !!safeModeEnabled,
  setSelfUid: (uid) => { selfUid = uid; },
  setThreadSafeMode: (threadId, enabled) => { if (threadId) THREAD_SAFE.set(String(threadId), !!enabled); },
  getThreadSafeMode: (threadId) => THREAD_SAFE.has(String(threadId)) ? !!THREAD_SAFE.get(String(threadId)) : null,
  forbiddenKeywords: {
    WORD_BLOCKLIST,
    LINK_BLOCKLIST,
  },
  respondAbuse,
  addForbiddenWords: (items = []) => {
    try {
      const toAdd = (Array.isArray(items) ? items : [items]).map(normalize).filter(Boolean);
      let changed = false;
      for (const w of toAdd) {
        if (!USER_WORDS.includes(w)) { USER_WORDS.push(w); changed = true; }
      }
      if (changed) { rebuildWordRegexes(); saveExtras(); }
      return { ok: true, added: toAdd };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
  addForbiddenLinks: (items = []) => {
    try {
      const toAdd = (Array.isArray(items) ? items : [items]).map(normalize).filter(Boolean);
      let changed = false;
      for (const u of toAdd) {
        if (!USER_LINKS.includes(u)) { USER_LINKS.push(u); changed = true; }
      }
      if (changed) saveExtras();
      return { ok: true, added: toAdd };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
  listForbiddenExtras: () => ({ words: [...USER_WORDS], links: [...USER_LINKS] }),
  removeForbidden: (items = []) => {
    try {
      const targets = (Array.isArray(items) ? items : [items]).map(normalize).filter(Boolean);
      if (!targets.length) return { ok: false, error: 'empty' };
      const beforeW = USER_WORDS.length;
      const beforeL = USER_LINKS.length;
      const setT = new Set(targets);
      USER_WORDS = USER_WORDS.filter(w => !setT.has(w));
      USER_LINKS = USER_LINKS.filter(u => !setT.has(u));
      const removedWords = beforeW - USER_WORDS.length;
      const removedLinks = beforeL - USER_LINKS.length;
      saveExtras();
      rebuildWordRegexes();
      return { ok: true, removedWords, removedLinks };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
  getViolationStats: () => {
    const stats = [];
    for (const [uid, data] of VIOLATION_STATS.entries()) {
      stats.push({
        uid,
        name: data.name,
        count: data.count,
        lastViolation: data.lastViolation
      });
    }
    return stats.sort((a, b) => b.count - a.count); // Sắp xếp theo số lần vi phạm
  },
  clearViolationStats: () => {
    VIOLATION_STATS.clear();
    return true;
  },
  recordViolation: recordViolation,
  __getViolationMap: () => VIOLATION_STATS, // Debug helper
};

// ======================== PHẢN HỒI LỊCH SỰ KHI CHỬI/SPAM BOT ========================
const __spamCounter = new Map(); // key: uid, value: { times: [], lastWarnAt }

function __isMentionBot(text) {
  const cfg = global?.config || {};
  const name = (cfg?.name_bot || 'bot').toLowerCase();
  const t = (text || '').toLowerCase();
  return t.includes('bot') || t.includes(name);
}

const ABUSE_TOWARDS_BOT = [
  'bot là cái thá gì','bot la cai tha gi',
  'bot ngu','bot dan','bot dốt','bot dot','bot ngao','bot rác','bot rac','bot sida','bot tồi','bot toi',
  'câm mồm bot','cam mom bot','cút bot','cut bot','cút đi bot','cut di bot'
];

function __isAbuseToBot(text) {
  const t = (text || '').toLowerCase();
  // Nếu không nhắc bot thì giảm false positives
  if (!__isMentionBot(t)) return false;
  const norm = t.replace(/\s+/g, ' ');
  return ABUSE_TOWARDS_BOT.some(p => norm.includes(p));
}

function __trackAndCheckSpam(uid) {
  const now = Date.now();
  const windowMs = 30 * 1000; // 30s
  const threshold = 6; // quá 6 lần/30s coi là spam
  let rec = __spamCounter.get(uid);
  if (!rec) rec = { times: [], lastWarnAt: 0 };
  rec.times = rec.times.filter(ts => now - ts < windowMs);
  rec.times.push(now);
  __spamCounter.set(uid, rec);
  const count = rec.times.length;
  const shouldWarn = count >= threshold && (now - rec.lastWarnAt) > 15000; // cảnh báo tối đa mỗi 15s
  if (shouldWarn) rec.lastWarnAt = now;
  return { isSpam: count >= threshold, count, shouldWarn };
}

async function respondAbuse({ api, event }) {
  try {
    const { data, threadId, type } = event || {};
    const text = data?.content || '';
    const uid = String(data?.uidFrom || '');
    if (!text || !uid) return false;

    // 1) Nếu chửi bot → đáp nhẹ nhàng
    if (__isAbuseToBot(text)) {
      const replies = [
        'Mình không hoàn hảo nhưng mình đang cố gắng giúp bạn. Nói nhẹ một chút cho vui cửa vui nhà nha ✨',
        'Nào mình cùng hạ nhiệt nhé. Bạn nói cụ thể vấn đề, mình hỗ trợ nhanh nhất có thể! 💡',
        'Bạn bình tĩnh nhé, mình ở đây để trợ giúp. Cứ mô tả rõ nhu cầu, mình xử ngay. 🤝'
      ];
      const msg = replies[Math.floor(Math.random() * replies.length)];
      await api.sendMessage(msg, threadId, type);
      return true;
    }

    // 2) Nếu spam gọi bot (nhắc tên bot hoặc prefix + lệnh) → cảnh báo
    const cfg = global?.config || {};
    const prefix = cfg.prefix || '/';
    const lower = text.toLowerCase().trim();
    const invoked = lower.startsWith(prefix) || __isMentionBot(lower);
    if (!invoked) return false;

    const { isSpam, count, shouldWarn } = __trackAndCheckSpam(uid);
    // Phản hồi nhẹ ở mốc 2, 3, 4 (nếu đủ thời gian từ lần cảnh báo gần nhất)
    if (!isSpam && shouldWarn) {
      if (count === 2) {
        await api.sendMessage('m từ từ được không, t đéo phải máy tính mà nhập nhanh vậy.', threadId, type);
        return true;
      }
      if (count === 3) {
        await api.sendMessage('đm m sủa nhanh, t còn tiếp người khác nữa.', threadId, type);
        return true;
      }
      if (count === 4) {
        await api.sendMessage('đm cút, đéo cho xài nữa.', threadId, type);
        return true;
      }
    }
    // Quá ngưỡng spam
    if (isSpam && shouldWarn) {
      await api.sendMessage('m đéo bt từ từ à', threadId, type);
      return true;
    }
  } catch {}
  return false;
}
