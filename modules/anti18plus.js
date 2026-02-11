'use strict';

let axios = null;
try {
  axios = require('axios');
} catch {}

let tf = null;
let nsfwjs = null;
let localAiAvailable = false;
let apiAvailable = false;
const missingDependencies = [];

const SIGHTENGINE_USER = process.env.SIGHTENGINE_API_USER || process.env.SIGHTENGINE_USER || '';
const SIGHTENGINE_SECRET = process.env.SIGHTENGINE_API_SECRET || process.env.SIGHTENGINE_SECRET || '';
apiAvailable = !!(axios && SIGHTENGINE_USER && SIGHTENGINE_SECRET);
if (axios && (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET)) {
  missingDependencies.push('SIGHTENGINE_API_USER', 'SIGHTENGINE_API_SECRET');
}

try {
  tf = require('@tensorflow/tfjs-node');
} catch {
  missingDependencies.push('@tensorflow/tfjs-node');
}

try {
  nsfwjs = require('nsfwjs');
} catch {
  missingDependencies.push('nsfwjs');
}

localAiAvailable = !!(axios && tf && nsfwjs);

let _modelPromise = null;
function getModel() {
  if (!localAiAvailable) return null;
  if (!_modelPromise) {
    _modelPromise = nsfwjs.load();
  }
  return _modelPromise;
}

function formatProbability(value) {
  if (!Number.isFinite(value)) return '0.0%';
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return `${pct.toFixed(1)}%`;
}

function safeStringify(obj, limit = 2500) {
  try {
    const json = JSON.stringify(obj);
    if (json.length > limit) return json.slice(0, limit) + '…';
    return json;
  } catch {
    return '';
  }
}

function normalizeText(text) {
  try {
    return String(text || '').toLowerCase();
  } catch {
    return '';
  }
}

function hasNsfwKeyword(text) {
  const t = normalizeText(text);
  if (!t) return false;

  const keywords = [
    'sex', 'sexy', 'porn', 'xxx', '18+', 'nude', 'naked', 'hentai', 'nsfw', 'adult',
    'jav', 'onlyfans', 'clip sex', 'phim sex', 'ảnh nóng', 'anh nong', 'khoe hang',
    'lồn', 'lon', 'loz', 'cặc', 'cac', 'buoi', 'buồi', 'dit', 'địt', 'đụ', 'du'
  ];

  const compact = t.replace(/\s+/g, '');
  return keywords.some(k => t.includes(k) || compact.includes(String(k).replace(/\s+/g, '')));
}

function collectAttachments(data) {
  const out = [];
  if (!data || typeof data !== 'object') return out;

  if (Array.isArray(data.attachments)) out.push(...data.attachments);
  if (Array.isArray(data?.propertyExt?.attachments)) out.push(...data.propertyExt.attachments);
  if (Array.isArray(data?.propertyExt?.mediaList)) out.push(...data.propertyExt.mediaList);

  return out.filter(Boolean);
}

function pickFirstImageUrl(data) {
  const atts = collectAttachments(data);

  const candidates = [];
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const url = a.url || a.href || a.src || a.originUrl || a.downloadUrl;
    const thumb = a.thumb || a.thumbnail || a.preview || a.thumbUrl;
    const t = normalizeText(a.type || a.mediaType || '');
    if (url) candidates.push(String(url));
    if (thumb) candidates.push(String(thumb));
    if (t.includes('image') && a?.data && typeof a.data === 'string' && a.data.startsWith('http')) {
      candidates.push(a.data);
    }
  }

  if (typeof data?.image_url === 'string') candidates.push(data.image_url);
  if (typeof data?.photoUrl === 'string') candidates.push(data.photoUrl);

  for (const c of candidates) {
    const u = String(c || '').trim();
    if (!u) continue;
    if (/^https?:\/\//i.test(u)) return u;
  }
  return null;
}

async function downloadImageBuffer(url, opts = {}) {
  if (!axios) return null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 12000;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 2_500_000;

  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    maxRedirects: 3,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'image/*,*/*;q=0.8'
    },
    validateStatus: (s) => s >= 200 && s < 400
  });

  const buf = Buffer.from(res.data);
  if (!buf.length) return null;
  if (buf.length > maxBytes) return null;

  const ct = String(res.headers?.['content-type'] || '').toLowerCase();
  if (ct && !ct.includes('image')) return null;

  return buf;
}

async function scanWithSightengine(url, threshold) {
  if (!apiAvailable || !axios) return null;

  const endpoint = 'https://api.sightengine.com/1.0/check.json';
  const params = {
    models: 'nudity-2',
    api_user: SIGHTENGINE_USER,
    api_secret: SIGHTENGINE_SECRET,
    url
  };

  const res = await axios.get(endpoint, { params, timeout: 15000, validateStatus: (s) => s >= 200 && s < 500 });
  const data = res?.data;
  if (!data || data?.status !== 'success') return null;

  // nudity-2: sexual_activity / sexual_display / erotica / suggestive / none
  const n = data?.nudity;
  if (!n || typeof n !== 'object') return null;

  const sexualActivity = Number(n.sexual_activity) || 0;
  const sexualDisplay = Number(n.sexual_display) || 0;
  const erotica = Number(n.erotica) || 0;
  const suggestive = Number(n.suggestive) || 0;
  const none = Number(n.none) || 0;

  const score = Math.max(sexualActivity, sexualDisplay, erotica, suggestive);
  const label = sexualActivity >= sexualDisplay && sexualActivity >= erotica && sexualActivity >= suggestive
    ? 'SEXUAL_ACTIVITY'
    : (sexualDisplay >= erotica && sexualDisplay >= suggestive
        ? 'SEXUAL_DISPLAY'
        : (erotica >= suggestive ? 'EROTICA' : 'SUGGESTIVE'));

  if (!Number.isFinite(score) || score < threshold) return null;

  return {
    label,
    score: Math.min(Math.max(score, 0), 0.99),
    host: 'sightengine-nudity-2',
    meta: {
      url,
      sexual_activity: sexualActivity,
      sexual_display: sexualDisplay,
      erotica,
      suggestive,
      none
    }
  };
}

function chooseNsfwScore(predictions) {
  if (!Array.isArray(predictions) || !predictions.length) return null;
  let best = predictions[0];
  for (const p of predictions) {
    if (typeof p?.probability === 'number' && p.probability > (best?.probability || 0)) best = p;
  }
  const map = {};
  for (const p of predictions) {
    if (!p || typeof p.className !== 'string') continue;
    map[p.className.toLowerCase()] = p.probability;
  }
  const porn = map.porn || 0;
  const sexy = map.sexy || 0;
  const hentai = map.hentai || 0;
  const nsfwScore = Math.max(porn, sexy, hentai);
  const label = porn >= sexy && porn >= hentai ? 'PORN' : (sexy >= hentai ? 'SEXY' : 'HENTAI');
  return { score: nsfwScore, label, predictions, porn, sexy, hentai, best };
}

function getAnySensitiveFlag(data) {
  if (!data || typeof data !== 'object') return false;

  if (data.isSensitive === true) return true;
  if (data?.propertyExt?.isSensitive === true) return true;

  const atts = collectAttachments(data);
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    if (a.isSensitive === true) return true;
    if (a?.propertyExt?.isSensitive === true) return true;
    if (a?.extra?.isSensitive === true) return true;

    const t = String(a.type || a.mediaType || '').toLowerCase();
    const u = String(a.url || a.href || a.thumb || a.thumbnail || '').toLowerCase();
    if (t.includes('sensitive')) return true;
    if (u.includes('sensitive') || u.includes('nsfw') || u.includes('18plus') || u.includes('adult')) return true;
  }

  return false;
}

function hasSuspiciousAttachmentHint(data) {
  const atts = collectAttachments(data);
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const t = normalizeText(a.type || a.mediaType || '');
    const u = normalizeText(a.url || a.href || a.thumb || a.thumbnail || '');
    const n = normalizeText(a.name || a.fileName || a.filename || '');
    if (t.includes('sensitive')) return true;
    if (u.includes('nsfw') || u.includes('18') || u.includes('adult') || u.includes('porn')) return true;
    if (n.includes('nsfw') || n.includes('18') || n.includes('adult') || n.includes('porn')) return true;
  }
  return false;
}

async function scanForNsfw(event, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.88;
  const data = event?.data;

  // 1) API scan (ưu tiên, không cần cài nặng)
  if (apiAvailable) {
    try {
      const url = pickFirstImageUrl(data);
      if (url) {
        const apiResult = await scanWithSightengine(url, threshold);
        if (apiResult) {
          return {
            ...apiResult,
            meta: {
              ...(apiResult.meta || {}),
              msgType: data?.msgType || data?.type,
              attachments: collectAttachments(data).length
            }
          };
        }
      }
    } catch (e) {
      if (options.logErrors) {
        // eslint-disable-next-line no-console
        console.warn('[anti18plus] sightengine scan error:', e?.message || e);
      }
    }
  }

  // 2) Local scan (nsfwjs) nếu có cài
  if (localAiAvailable) {
    try {
      const url = pickFirstImageUrl(data);
      if (url) {
        const buf = await downloadImageBuffer(url, {
          timeoutMs: 12000,
          maxBytes: 2_500_000
        });

        if (buf) {
          const model = await getModel();
          if (model) {
            const imageTensor = tf.node.decodeImage(buf, 3);
            try {
              const predictions = await model.classify(imageTensor);
              const picked = chooseNsfwScore(predictions);
              if (picked && Number.isFinite(picked.score) && picked.score >= threshold) {
                return {
                  label: picked.label,
                  score: Math.min(Math.max(picked.score, 0), 0.99),
                  host: 'nsfwjs-local',
                  meta: {
                    url,
                    msgType: data?.msgType || data?.type,
                    porn: picked.porn,
                    sexy: picked.sexy,
                    hentai: picked.hentai,
                    best: picked.best,
                    attachments: collectAttachments(data).length
                  }
                };
              }
            } finally {
              try { imageTensor.dispose(); } catch {}
            }
          }
        }
      }
    } catch (e) {
      if (options.logErrors) {
        // eslint-disable-next-line no-console
        console.warn('[anti18plus] nsfwjs scan error:', e?.message || e);
      }
    }
  }

  const sensitiveFlag = getAnySensitiveFlag(data);
  const hint = hasSuspiciousAttachmentHint(data);
  const text = data?.msg || data?.body || data?.content || '';
  const keywordHit = hasNsfwKeyword(text);

  if (!sensitiveFlag && !hint && !keywordHit) return null;

  const score = sensitiveFlag
    ? Math.max(threshold + 0.01, 0.9)
    : Math.max(threshold, 0.75);

  const label = sensitiveFlag ? 'NSFW' : (keywordHit ? 'NSFW_KEYWORD' : 'NSFW_HINT');
  const host = sensitiveFlag ? 'zalo-flag' : (keywordHit ? 'caption-keyword' : 'attachment-hint');

  return {
    label,
    score: Math.min(score, 0.99),
    host,
    meta: {
      msgType: data?.msgType || data?.type,
      attachments: collectAttachments(data).length,
      sample: safeStringify({ msgType: data?.msgType || data?.type, keys: Object.keys(data || {}) }, 800)
    }
  };
}

module.exports = {
  isNsfwSupported: true,
  missingDependencies,
  scanForNsfw,
  formatProbability
};
