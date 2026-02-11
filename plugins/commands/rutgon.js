const axios = require('axios');

module.exports.config = {
  name: 'rutgon',
  aliases: ['rg', 'short', 'shorten', 'tiny', 'tinyurl', 'isgd', 'linkngan'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Rút gọn link (is.gd + TinyURL fallback)',
  category: 'Tiện ích',
  usage: 'rutgon <url1> [url2 ...] (tối đa 10)',
  cooldowns: 3,
  dependencies: { axios: '' }
};

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

async function shortenOne(url) {
  const enc = encodeURIComponent(url);
  try {
    const res = await axios.get(`https://is.gd/create.php?format=simple&url=${enc}`, { timeout: 12000 });
    const t = String(res.data || '').trim();
    if (t && /^https?:\/\//i.test(t)) return t;
  } catch {}

  try {
    const res2 = await axios.get(`https://tinyurl.com/api-create.php?url=${enc}`, { timeout: 12000 });
    const t2 = String(res2.data || '').trim();
    if (t2 && /^https?:\/\//i.test(t2)) return t2;
  } catch {}

  return null;
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event;

  const urls = (args || [])
    .filter(Boolean)
    .map(normalizeUrl)
    .filter(Boolean)
    .slice(0, 10);

  if (!urls.length) {
    return api.sendMessage(
      'Dùng: rutgon <url1> [url2 ...]\nVí dụ: rutgon https://google.com',
      threadId,
      type
    );
  }

  const results = [];
  for (const u of urls) {
    try {
      const short = await shortenOne(u);
      results.push({ original: u, short });
    } catch {
      results.push({ original: u, short: null });
    }
  }

  const lines = [];
  for (const r of results) {
    if (r.short) {
      lines.push(`✅ ${r.short}\n↳ ${r.original}`);
    } else {
      lines.push(`❌ Không rút gọn được\n↳ ${r.original}`);
    }
  }

  return api.sendMessage(lines.join('\n\n'), threadId, type);
};
