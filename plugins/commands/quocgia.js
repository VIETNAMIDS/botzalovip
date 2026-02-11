const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const COUNTRY_FIELDS = [
  'name',
  'name.nativeName',
  'altSpellings',
  'translations',
  'capital',
  'region',
  'subregion',
  'population',
  'area',
  'languages',
  'currencies',
  'timezones',
  'continents',
  'maps',
  'flags',
  'coatOfArms',
  'demonyms',
  'cca2',
  'cca3',
  'cioc'
].join(',');

module.exports.config = {
  name: 'quocgia',
  version: '3.0.0',
  role: 0,
  author: 'Cascade | Upgraded by Claude',
  description: 'Tra cứu thông tin quốc gia, xuất ảnh Canva cao cấp hoặc liệt kê toàn bộ danh sách quốc gia',
  category: 'Tiện ích',
  usage: 'quocgia <tên quốc gia|list>',
  cooldowns: 10,
  dependencies: { axios: '', canvas: '' }
};

const QUERY_ALIASES = {
  'trung quoc': 'China',
  'trung quốc': 'China',
  'han quoc': 'South Korea',
  'hàn quốc': 'South Korea',
  'bac han': 'North Korea',
  'bắc hàn': 'North Korea',
  'nhat ban': 'Japan',
  'nhật bản': 'Japan',
  'campuchia': 'Cambodia',
  'cao mien': 'Cambodia',
  'lao': 'Laos',
  'myanmar': 'Myanmar',
  'mi an ma': 'Myanmar',
  'thai lan': 'Thailand',
  'thái lan': 'Thailand',
  'philippines': 'Philippines',
  'singapore': 'Singapore',
  'malaysia': 'Malaysia',
  'indonesia': 'Indonesia',
  'an do': 'India',
  'ấn độ': 'India',
  'a rap xe ut': 'Saudi Arabia',
  'ả rập xê út': 'Saudi Arabia',
  'tieu vuong quoc a rap thong nhat': 'United Arab Emirates',
  'tiểu vương quốc ả rập thống nhất': 'United Arab Emirates',
  'uae': 'United Arab Emirates',
  'anh': 'United Kingdom',
  'nuoc anh': 'United Kingdom',
  'nước anh': 'United Kingdom',
  'my': 'United States',
  'hoa ky': 'United States',
  'hoa kỳ': 'United States',
  'nga': 'Russia',
  'lien bang nga': 'Russia',
  'liên bang nga': 'Russia',
  'duc': 'Germany',
  'đức': 'Germany',
  'ha lan': 'Netherlands',
  'hà lan': 'Netherlands',
  'tay ban nha': 'Spain',
  'tây ban nha': 'Spain',
  'y': 'Italy',
  'bi': 'Belgium',
  'thuy si': 'Switzerland',
  'thụy sĩ': 'Switzerland',
  'cong hoa sec': 'Czechia',
  'cộng hòa séc': 'Czechia'
};

function rewriteQueryAlias(query) {
  const normalized = normalizeText(query);
  if (!normalized) return null;
  return QUERY_ALIASES[normalized] || null;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (!Array.isArray(args) || args.length === 0) {
    return api.sendMessage('❌ Vui lòng nhập tên quốc gia. Ví dụ: quocgia Viet Nam', threadId, type);
  }

  const query = args.join(' ').trim();
  if (!query.length) {
    return api.sendMessage('❌ Tên quốc gia không hợp lệ.', threadId, type);
  }

  const normalizedQuery = normalizeText(query);
  if (isListCommand(normalizedQuery)) {
    return handleListCountries(api, threadId, type);
  }

  const rewrittenQuery = rewriteQueryAlias(query);
  const effectiveQuery = rewrittenQuery || query;
  const effectiveNormalizedQuery = normalizeText(effectiveQuery);

  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(effectiveQuery)}?fields=${COUNTRY_FIELDS}`;

  let info = null;
  let primaryError = null;

  try {
    const response = await axios.get(url, { timeout: 15000 });
    const data = Array.isArray(response?.data) ? response.data : [];
    if (data.length > 0) {
      info = pickBestCountryMatch(data, effectiveNormalizedQuery) || data[0];
    }
  } catch (error) {
    primaryError = error;
    if (!isNotFoundError(error)) {
      const reason = getErrorReason(error);
      console.error(`[quocgia] Lỗi tra cứu "${effectiveQuery}":`, reason);
      return api.sendMessage(`❌ Đã xảy ra lỗi khi tra cứu quốc gia "${effectiveQuery}".\n📛 Lỗi: ${reason}`, threadId, type);
    }
  }

  if (!info) {
    info = await findCountryByTranslation(effectiveQuery, effectiveNormalizedQuery);
  }

  if (!info) {
    info = await findCountryByLooseQuery(effectiveQuery);
  }

  if (!info) {
    info = await findCountryByAlphaCode(effectiveQuery, effectiveNormalizedQuery);
  }

  if (!info) {
    const reason = primaryError ? getErrorReason(primaryError) : 'Không tìm thấy quốc gia phù hợp.';
    console.warn(`[quocgia] Không tìm thấy "${effectiveQuery}" sau khi thử fallback. Lý do: ${reason}`);
    return api.sendMessage(`❌ Không tìm thấy thông tin cho quốc gia "${effectiveQuery}".`, threadId, type);
  }

  const country = normalizeCountryInfo(info, query);

  try {
    const imagePath = await createCountryPoster(country);
    await api.sendMessage(
      {
        msg: renderFullText(country),
        attachments: [imagePath]
      },
      threadId,
      type
    );

    setTimeout(() => {
      try {
        fs.unlinkSync(imagePath);
      } catch {}
    }, 120000);
    return;
  } catch (renderError) {
    console.warn('[quocgia] Lỗi tạo ảnh Canva, fallback text:', renderError?.message || renderError);
  }

  return api.sendMessage(renderFullText(country), threadId, type);
};

function isListCommand(normalizedQuery = '') {
  const q = String(normalizedQuery || '').trim().toLowerCase();
  return q === 'list' || q === 'ds' || q === 'danhsach' || q === 'all';
}

async function handleListCountries(api, threadId, type) {
  try {
    const countries = await fetchAllCountriesCached();
    if (!countries.length) {
      return api.sendMessage('❌ Không lấy được danh sách quốc gia.', threadId, type);
    }

    const names = countries
      .map((c) => c?.name?.common)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), 'vi-VN'));

    const preview = names.slice(0, 120);
    const more = names.length > preview.length ? `\n... và ${names.length - preview.length} quốc gia khác.` : '';
    const text = `🌍 Danh sách quốc gia (hiển thị ${preview.length}/${names.length}):\n\n${preview.join(', ')}${more}`;
    return api.sendMessage(text, threadId, type);
  } catch (error) {
    return api.sendMessage(`❌ Không thể lấy danh sách quốc gia.\n📛 Lỗi: ${getErrorReason(error)}`, threadId, type);
  }
}

function pickBestCountryMatch(candidates = [], normalizedQuery = '') {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const q = normalizeText(normalizedQuery);
  if (!q) return candidates[0] || null;

  let best = null;
  let bestScore = 0;
  for (const item of candidates) {
    const keywords = collectCountryKeywords(item);
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      const score = computeMatchScore(q, normalizedKeyword);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }

  return best || candidates[0] || null;
}

function normalizeCountryInfo(info, fallbackName) {
  const name = info?.name?.common || fallbackName;
  const officialName = info?.name?.official || 'Không rõ';
  const capital = Array.isArray(info?.capital) && info.capital[0] ? info.capital[0] : 'Không rõ';
  const region = info?.region || 'Không rõ';
  const subregion = info?.subregion || 'Không rõ';
  const population = formatNumber(info?.population);
  const area = typeof info?.area === 'number' ? `${info.area.toLocaleString('vi-VN')} km²` : 'Không rõ';
  const languages = info?.languages ? Object.values(info.languages).join(', ') : 'Không rõ';
  const currencies = info?.currencies
    ? Object.values(info.currencies).map((c) => `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`).join(', ')
    : 'Không rõ';
  const timezones = Array.isArray(info?.timezones) ? info.timezones.join(', ') : 'Không rõ';
  const continents = Array.isArray(info?.continents) ? info.continents.join(', ') : 'Không rõ';
  const googleMaps = info?.maps?.googleMaps || 'Không rõ';
  const openStreetMaps = info?.maps?.openStreetMaps || '';
  const flagUrl = info?.flags?.png || info?.flags?.svg || '';
  const coatOfArms = info?.coatOfArms?.png || info?.coatOfArms?.svg || '';

  return {
    name,
    officialName,
    capital,
    region,
    subregion,
    population,
    area,
    languages,
    currencies,
    timezones,
    continents,
    googleMaps,
    openStreetMaps,
    flagUrl,
    coatOfArms
  };
}

function renderSummaryText(country) {
  return [
    `🌍 ${country.name}`,
    `${country.capital} · ${country.region}`,
    '',
    country.googleMaps && country.googleMaps !== 'Không rõ' ? `📍 ${country.googleMaps}` : '📍 Không có Google Maps',
    '',
    '👤 Founder: BONZ VIPP'
  ].join('\n');
}

function renderFullText(country) {
  const lines = [
    '🌎 THÔNG TIN QUỐC GIA 🌎',
    '',
    `🗺️ Quốc gia: ${country.name} (${country.officialName})`,
    `🏰 Thủ đô: ${country.capital}`,
    `🌍 Khu vực: ${country.region}`,
    `🌐 Tiểu khu vực: ${country.subregion}`,
    `👥 Dân số: ${country.population}`,
    `📏 Diện tích: ${country.area}`,
    `🗣️ Ngôn ngữ: ${country.languages}`,
    `💰 Tiền tệ: ${country.currencies}`,
    `⏰ Múi giờ: ${country.timezones}`,
    `🌐 Lục địa: ${country.continents}`,
    `📍 Google Maps: ${country.googleMaps}`
  ];

  if (country.openStreetMaps) {
    lines.push(`🗾 OpenStreetMap: ${country.openStreetMaps}`);
  }

  if (country.flagUrl) {
    lines.push('', `🔱 Cờ: ${country.flagUrl}`);
  }

  if (country.coatOfArms) {
    lines.push(`🛡️ Quốc huy: ${country.coatOfArms}`);
  }

  lines.push('', '👤 Founder: BONZ VIPP');
  return lines.join('\n');
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toLocaleString('vi-VN') : 'Không rõ';
}

function getErrorReason(error) {
  return error?.response?.data?.message || error?.message || 'Không xác định';
}

function isNotFoundError(error) {
  const status = error?.response?.status;
  const message = (error?.response?.data?.message || error?.message || '').toLowerCase();
  return status === 404 || message.includes('not found') || message.includes('404');
}

async function findCountryByTranslation(query, normalizedQuery = '') {
  const q = String(query || '').trim();
  if (!q) return null;

  const url = `https://restcountries.com/v3.1/translation/${encodeURIComponent(q)}?fields=${COUNTRY_FIELDS}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    const data = Array.isArray(response?.data) ? response.data : [];
    if (!data.length) return null;
    return pickBestCountryMatch(data, normalizeText(normalizedQuery || q)) || data[0];
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.warn('[quocgia] Lỗi tra translation:', getErrorReason(error));
    }
    return null;
  }
}

const ALL_CACHE_KEY = '__quocgia_all_cache_v1';
async function fetchAllCountriesCached() {
  const now = Date.now();
  const ttlMs = 6 * 60 * 60 * 1000;

  const cacheDir = path.join(__dirname, 'cache');
  const cacheFile = path.join(cacheDir, 'countries_all.json');

  const current = global?.[ALL_CACHE_KEY];
  if (current && Array.isArray(current.data) && current.at && now - current.at < ttlMs) {
    return current.data;
  }

  try {
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length) {
        const at = Number(parsed.at) || 0;
        if (at && now - at < ttlMs) {
          try {
            global[ALL_CACHE_KEY] = { at, data: parsed.data };
          } catch {}
          return parsed.data;
        }
      }
    }
  } catch (error) {
    // ignore cache read errors
  }

  try {
    const response = await axios.get(`https://restcountries.com/v3.1/all?fields=${COUNTRY_FIELDS}`, { timeout: 25000 });
    const countries = Array.isArray(response?.data) ? response.data : [];
    try {
      global[ALL_CACHE_KEY] = { at: now, data: countries };
    } catch {}
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cacheFile, JSON.stringify({ at: now, data: countries }));
    } catch {}
    return countries;
  } catch (error) {
    try {
      const stale = global?.[ALL_CACHE_KEY];
      if (stale && Array.isArray(stale.data) && stale.data.length) {
        return stale.data;
      }
    } catch {}
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = fs.readFileSync(cacheFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length) {
          return parsed.data;
        }
      }
    } catch {}
    throw error;
  }
}

async function findCountryByAlphaCode(query, normalizedQuery = '') {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const code = normalizeText(raw).replace(/\s+/g, '');
  if (!/^[a-z0-9]{2,3}$/.test(code)) return null;

  const url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(code)}?fields=${COUNTRY_FIELDS}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    const data = response?.data;
    if (Array.isArray(data) && data.length) {
      return pickBestCountryMatch(data, normalizeText(normalizedQuery || raw)) || data[0];
    }
    if (data && typeof data === 'object') {
      return data;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.warn('[quocgia] Lỗi tra alpha:', getErrorReason(error));
    }
  }
  return null;
}

async function findCountryByLooseQuery(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return null;
  }

  try {
    const countries = await fetchAllCountriesCached();
    if (!countries.length) {
      return null;
    }

    let bestMatch = null;
    let bestScore = 0;

    countries.forEach((item) => {
      const keywords = collectCountryKeywords(item);
      keywords.forEach((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) {
          return;
        }
        const score = computeMatchScore(normalizedQuery, normalizedKeyword);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      });
    });

    if (bestMatch && bestScore >= 0.45) {
      return bestMatch;
    }
  } catch (error) {
    console.warn('[quocgia] Lỗi fallback tìm quốc gia:', error?.message || error);
  }

  return null;
}

function collectCountryKeywords(info) {
  const bucket = new Set();

  const push = (value) => {
    if (typeof value === 'string' && value.trim()) {
      bucket.add(value.trim());
    }
  };

  push(info?.name?.common);
  push(info?.name?.official);

  if (Array.isArray(info?.altSpellings)) {
    info.altSpellings.forEach(push);
  }

  if (Array.isArray(info?.capital)) {
    info.capital.forEach(push);
  }

  if (info?.translations && typeof info.translations === 'object') {
    Object.values(info.translations).forEach((translation) => {
      if (!translation || typeof translation !== 'object') {
        return;
      }
      push(translation.common);
      push(translation.official);
    });
  }

  if (info?.demonyms && typeof info.demonyms === 'object') {
    Object.values(info.demonyms).forEach((dem) => {
      if (!dem || typeof dem !== 'object') {
        return;
      }
      push(dem.f);
      push(dem.m);
    });
  }

  if (info?.name?.nativeName && typeof info.name.nativeName === 'object') {
    Object.values(info.name.nativeName).forEach((native) => {
      if (!native || typeof native !== 'object') {
        return;
      }
      push(native.common);
      push(native.official);
    });
  }

  if (info?.region) {
    push(info.region);
  }

  if (info?.subregion) {
    push(info.subregion);
  }

  if (Array.isArray(info?.continents)) {
    info.continents.forEach(push);
  }

  if (info?.cca2) {
    push(info.cca2);
  }

  if (info?.cca3) {
    push(info.cca3);
  }

  if (info?.cioc) {
    push(info.cioc);
  }

  return Array.from(bucket);
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function computeMatchScore(query, candidate) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate === query) {
    return 1;
  }

  if (candidate.startsWith(query) || query.startsWith(candidate)) {
    return 0.9;
  }

  if (candidate.includes(query)) {
    return Math.max(0.7, query.length / Math.max(candidate.length, 1));
  }

  const queryWords = new Set(query.split(' '));
  const candidateWords = new Set(candidate.split(' '));
  const intersection = new Set([...queryWords].filter((word) => candidateWords.has(word)));
  if (intersection.size > 0) {
    return Math.min(0.8, intersection.size / Math.max(queryWords.size, 1));
  }

  let hits = 0;
  const candidateChars = new Set(candidate.split(''));
  for (const char of query) {
    if (candidateChars.has(char)) {
      hits += 1;
    }
  }

  return (hits / Math.max(query.length, 1)) * 0.4;
}

// ==================== NÂNG CẤP CANVAS ====================

async function createCountryPoster(country) {
  const width = 1200;
  const height = 1800; // Tăng từ 1600 lên 1800
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient CUTE PASTEL
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#667eea');
  bgGradient.addColorStop(0.25, '#764ba2');
  bgGradient.addColorStop(0.5, '#f093fb');
  bgGradient.addColorStop(0.75, '#4facfe');
  bgGradient.addColorStop(1, '#667eea');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ pattern nền CUTE
  drawCuteBackgroundPattern(ctx, width, height);

  // Card chính
  const card = {
    x: 60,
    y: 80,
    w: width - 120,
    h: height - 240, // Tăng khoảng trống dưới
    radius: 32
  };

  // Shadow cho card
  ctx.shadowColor = 'rgba(102, 126, 234, 0.4)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 25;

  // Border card RAINBOW GRADIENT
  const cardBorderGradient = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
  cardBorderGradient.addColorStop(0, '#fbbf24');
  cardBorderGradient.addColorStop(0.33, '#f472b6');
  cardBorderGradient.addColorStop(0.66, '#a78bfa');
  cardBorderGradient.addColorStop(1, '#34d399');
  ctx.fillStyle = cardBorderGradient;
  drawRoundedRect(ctx, card.x - 6, card.y - 6, card.w + 12, card.h + 12, card.radius + 6);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Background card PASTEL
  const cardGradient = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.h);
  cardGradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  cardGradient.addColorStop(0.5, 'rgba(252, 231, 243, 0.95)');
  cardGradient.addColorStop(1, 'rgba(255, 255, 255, 0.98)');
  ctx.fillStyle = cardGradient;
  drawRoundedRect(ctx, card.x, card.y, card.w, card.h, card.radius);

  // ==================== HEADER SECTION ====================
  const centerX = width / 2;
  let currentY = card.y + 60;

  // Decorative header bar CUTE với sparkles
  const headerBarGradient = ctx.createLinearGradient(card.x + 40, 0, card.x + card.w - 40, 0);
  headerBarGradient.addColorStop(0, 'rgba(251, 191, 36, 0)');
  headerBarGradient.addColorStop(0.25, 'rgba(244, 114, 182, 0.8)');
  headerBarGradient.addColorStop(0.5, 'rgba(167, 139, 250, 1)');
  headerBarGradient.addColorStop(0.75, 'rgba(52, 211, 153, 0.8)');
  headerBarGradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = headerBarGradient;
  ctx.fillRect(card.x + 60, currentY, card.w - 120, 5);
  
  // Thêm sparkle emoji
  ctx.font = '20px Arial';
  ctx.fillText('✨', card.x + 70, currentY + 3);
  ctx.fillText('✨', card.x + card.w - 90, currentY + 3);
  ctx.fillText('💫', centerX - 10, currentY + 3);

  currentY += 40;

  // Flag container với border CUTE & TO
  const flagSize = 240; // Tăng từ 160 lên 240!
  const flagY = currentY + 20;
  
  // Outer glow layer 1 - xa nhất
  ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
  ctx.shadowBlur = 50;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2 + 25, 0, Math.PI * 2);
  ctx.fill();
  
  // Outer glow layer 2
  ctx.shadowColor = 'rgba(244, 114, 182, 0.5)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = 'rgba(244, 114, 182, 0.15)';
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2 + 18, 0, Math.PI * 2);
  ctx.fill();
  
  // Outer glow layer 3 - gần nhất
  ctx.shadowColor = 'rgba(167, 139, 250, 0.6)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(167, 139, 250, 0.2)';
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2 + 12, 0, Math.PI * 2);
  ctx.fill();
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Border gradient rainbow CUTE
  const borderGradient = ctx.createLinearGradient(
    centerX - flagSize/2, 
    flagY - flagSize/2, 
    centerX + flagSize/2, 
    flagY + flagSize/2
  );
  borderGradient.addColorStop(0, '#fbbf24');
  borderGradient.addColorStop(0.25, '#f472b6');
  borderGradient.addColorStop(0.5, '#a78bfa');
  borderGradient.addColorStop(0.75, '#34d399');
  borderGradient.addColorStop(1, '#fbbf24');
  
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2 + 6, 0, Math.PI * 2);
  ctx.stroke();
  
  // Border trắng inner
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2 + 1, 0, Math.PI * 2);
  ctx.stroke();

  // Background trắng cho flag
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, flagY, flagSize / 2, 0, Math.PI * 2);
  ctx.fill();

  // Vẽ flag
  await drawFlag(ctx, country.flagUrl, centerX, flagY, flagSize);
  
  // Thêm sparkles xung quanh flag
  drawSparkles(ctx, centerX, flagY, flagSize / 2 + 30);

  currentY = flagY + flagSize / 2 + 60;

  // Tên quốc gia
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Shadow cho text
  ctx.shadowColor = 'rgba(167, 139, 250, 0.5)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 4;
  
  // Text gradient CUTE
  const nameGradient = ctx.createLinearGradient(centerX - 200, currentY, centerX + 200, currentY);
  nameGradient.addColorStop(0, '#667eea');
  nameGradient.addColorStop(0.5, '#764ba2');
  nameGradient.addColorStop(1, '#667eea');
  ctx.fillStyle = nameGradient;
  ctx.font = 'bold 62px "Segoe UI", Arial, sans-serif';
  
  // Truncate tên nếu quá dài
  const maxNameWidth = card.w - 120;
  let displayName = country.name;
  if (ctx.measureText(displayName).width > maxNameWidth) {
    while (ctx.measureText(displayName + '...').width > maxNameWidth && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  
  ctx.fillText(displayName, centerX, currentY);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  currentY += 50;

  // Subtitle
  ctx.font = '28px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#8b5cf6';
  const subtitle = `${country.capital} • ${country.region}`;
  ctx.fillText(subtitle, centerX, currentY);

  currentY += 60;

  // Divider CUTE với dots
  const dividerY = currentY;
  
  // Line gradient
  const dividerGradient = ctx.createLinearGradient(card.x + 80, 0, card.x + card.w - 80, 0);
  dividerGradient.addColorStop(0, 'rgba(251, 191, 36, 0)');
  dividerGradient.addColorStop(0.25, 'rgba(244, 114, 182, 0.6)');
  dividerGradient.addColorStop(0.5, 'rgba(167, 139, 250, 0.8)');
  dividerGradient.addColorStop(0.75, 'rgba(52, 211, 153, 0.6)');
  dividerGradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = dividerGradient;
  ctx.fillRect(card.x + 100, dividerY, card.w - 200, 3);
  
  // Dots decoration
  const dotColors = ['#fbbf24', '#f472b6', '#a78bfa', '#34d399'];
  for (let i = 0; i < 5; i++) {
    const dotX = centerX - 80 + (i * 40);
    ctx.fillStyle = dotColors[i % dotColors.length];
    ctx.beginPath();
    ctx.arc(dotX, dividerY + 1, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  currentY += 50;

  // ==================== INFO SECTIONS ====================
  const leftX = card.x + 70;
  const rightX = card.x + card.w - 70;
  const contentWidth = rightX - leftX;

  const sections = [
    {
      icon: '🌍',
      title: 'THÔNG TIN CHÍNH',
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.1)',
      rows: [
        { label: 'Tên chính thức', value: country.officialName },
        { label: 'Tiểu khu vực', value: country.subregion },
        { label: 'Lục địa', value: country.continents }
      ]
    },
    {
      icon: '👥',
      title: 'DÂN SỐ & LÃNH THỔ',
      color: '#ec4899',
      bgColor: 'rgba(236, 72, 153, 0.1)',
      rows: [
        { label: 'Dân số', value: country.population },
        { label: 'Diện tích', value: country.area }
      ]
    },
    {
      icon: '💬',
      title: 'VĂN HÓA',
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.1)',
      rows: [
        { label: 'Ngôn ngữ', value: country.languages },
        { label: 'Tiền tệ', value: country.currencies }
      ]
    },
    {
      icon: '⏰',
      title: 'MÚI GIỜ',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.1)',
      rows: [
        { label: 'Múi giờ', value: country.timezones }
      ]
    }
  ];

  sections.forEach((section, sectionIndex) => {
    // Section header với CUTE style
    const headerHeight = 60;
    
    // Background cho header
    ctx.fillStyle = section.bgColor;
    drawRoundedRect(ctx, leftX - 15, currentY - 12, contentWidth + 30, headerHeight, 15);
    
    // Border gradient cho header
    const headerBorderGradient = ctx.createLinearGradient(leftX, currentY, rightX, currentY);
    headerBorderGradient.addColorStop(0, section.color + '00');
    headerBorderGradient.addColorStop(0.5, section.color);
    headerBorderGradient.addColorStop(1, section.color + '00');
    ctx.strokeStyle = headerBorderGradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftX, currentY + headerHeight - 12);
    ctx.lineTo(rightX, currentY + headerHeight - 12);
    ctx.stroke();

    // Icon với shadow
    ctx.shadowColor = section.color;
    ctx.shadowBlur = 10;
    ctx.font = '34px Arial';
    ctx.fillText(section.icon, leftX + 5, currentY + 20);
    ctx.shadowBlur = 0;

    // Title
    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = section.color;
    ctx.textAlign = 'left';
    ctx.fillText(section.title, leftX + 55, currentY + 20);

    currentY += headerHeight + 12;

    // Rows
    section.rows.forEach((row, rowIndex) => {
      const rowHeight = 80; // Tăng từ 75 lên 80
      const rowY = currentY;

      // Alternating background CUTE
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = 'rgba(249, 250, 251, 0.8)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      }
      drawRoundedRect(ctx, leftX - 15, rowY - 10, contentWidth + 30, rowHeight, 10);

      // Label với icon dot
      ctx.fillStyle = section.color;
      ctx.beginPath();
      ctx.arc(leftX - 5, rowY + 5, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = section.color;
      ctx.textAlign = 'left';
      ctx.fillText(row.label.toUpperCase(), leftX + 10, rowY + 5);

      // Value
      ctx.font = '21px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#4b5563';
      drawWrappedText(ctx, row.value, leftX + 10, rowY + 38, contentWidth - 20, 28);

      currentY += rowHeight + 8;
    });

    currentY += 35; // Tăng spacing giữa các sections từ 25 lên 35
  });

  // ==================== FOOTER ====================
  // Đặt footer ở vị trí cố định dưới cùng
  const footerY = height - 100;

  // Creator credit với style cute
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  
  // Tạo gradient text effect
  const textGradient = ctx.createLinearGradient(centerX - 200, footerY, centerX + 200, footerY);
  textGradient.addColorStop(0, '#fbbf24');
  textGradient.addColorStop(0.5, '#f472b6');
  textGradient.addColorStop(1, '#a78bfa');
  ctx.fillStyle = textGradient;
  
  ctx.fillText('✨ Designed by BONZ VIPP ✨', centerX, footerY);
  
  // Sub text
  ctx.font = 'italic 18px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Made with ❤️', centerX, footerY + 35);

  // Lưu file
  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const outputPath = path.join(cacheDir, `country_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

async function drawFlag(ctx, url, centerX, centerY, size) {
  if (!url) return;
  try {
    const flag = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Fit flag properly
    const flagAspect = flag.width / flag.height;
    let drawWidth = size;
    let drawHeight = size;
    
    if (flagAspect > 1) {
      drawHeight = size / flagAspect;
    } else {
      drawWidth = size * flagAspect;
    }
    
    const offsetX = centerX - drawWidth / 2;
    const offsetY = centerY - drawHeight / 2;
    
    ctx.drawImage(flag, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();
  } catch (error) {
    console.warn('[quocgia] Không thể tải cờ:', error?.message || error);
    
    // Vẽ placeholder nếu không load được flag
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Flag', centerX, centerY);
  }
}

function drawBackgroundPattern(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  
  // Grid pattern
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  
  const spacing = 60;
  for (let x = 0; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  for (let y = 0; y < height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawCuteBackgroundPattern(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  
  // Vẽ hearts và stars pattern
  const spacing = 80;
  const shapes = ['💝', '⭐', '💖', '✨', '🌟', '💕'];
  
  for (let x = 0; x < width; x += spacing) {
    for (let y = 0; y < height; y += spacing) {
      const shape = shapes[Math.floor((x + y) / spacing) % shapes.length];
      ctx.font = '24px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(shape, x, y);
    }
  }
  
  ctx.restore();
}

function drawSparkles(ctx, centerX, centerY, radius) {
  const sparkles = [
    { angle: 0, distance: radius, size: '✨', offset: 0 },
    { angle: Math.PI / 2, distance: radius, size: '⭐', offset: 10 },
    { angle: Math.PI, distance: radius, size: '💫', offset: 5 },
    { angle: Math.PI * 1.5, distance: radius, size: '✨', offset: -5 },
    { angle: Math.PI / 4, distance: radius + 10, size: '🌟', offset: 8 },
    { angle: Math.PI * 0.75, distance: radius + 10, size: '⭐', offset: -8 },
    { angle: Math.PI * 1.25, distance: radius + 10, size: '✨', offset: 12 },
    { angle: Math.PI * 1.75, distance: radius + 10, size: '💫', offset: -10 }
  ];
  
  ctx.save();
  ctx.font = '22px Arial';
  
  sparkles.forEach((sparkle, index) => {
    const x = centerX + Math.cos(sparkle.angle) * sparkle.distance;
    const y = centerY + Math.sin(sparkle.angle) * sparkle.distance + sparkle.offset;
    
    // Tạo hiệu ứng lấp lánh
    ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 200 + index) * 0.4;
    ctx.fillText(sparkle.size, x - 10, y);
  });
  
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
  let line = '';
  let currentY = y;
  const lines = [];

  // Build lines
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && i > 0) {
      lines.push(line.trim());
      line = words[i] + ' ';
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    lines.push(line.trim());
  }

  // Draw lines
  lines.forEach((lineText, index) => {
    ctx.fillText(lineText, x, currentY + (index * lineHeight));
  });
}