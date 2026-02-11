const axios = require('axios');

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  const n = Number(num);
  if (!Number.isFinite(n)) return String(num);
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function extractUsername(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (raw.startsWith('@')) return raw.replace(/^@+/, '');

  const m1 = raw.match(/tiktok\.com\/@([^/?#]+)/i);
  if (m1?.[1]) return m1[1];

  const m2 = raw.match(/@([A-Za-z0-9._]+)/);
  if (m2?.[1]) return m2[1];

  if (/^[A-Za-z0-9._]{2,}$/.test(raw)) return raw;

  return null;
}

async function fetchTiktokUser(username) {
  const makeUrl = (u, at = true) => `https://api.zeidteam.xyz/tiktok/user-info?username=${at ? '@' : ''}${encodeURIComponent(u)}`;

  try {
    return await axios.get(makeUrl(username, true), { timeout: 15000 });
  } catch (_) {
    return await axios.get(makeUrl(username, false), { timeout: 15000 });
  }
}

module.exports.config = {
  name: 'infotiktok',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Lấy thông tin tài khoản TikTok',
  category: 'Tiện ích',
  usage: 'infotiktok <@username | link>',
  cooldowns: 2
};

module.exports.run = async function ({ args, event, api }) {
  const { threadId, type } = event;

  const input = args.join(' ').trim();
  const username = extractUsername(input);
  if (!username) {
    return api.sendMessage('⚠️ Vui lòng nhập username hoặc link TikTok.\nVí dụ: infotiktok @tiktok\nHoặc: infotiktok https://www.tiktok.com/@tiktok', threadId, type);
  }

  try {
    const response = await fetchTiktokUser(username);
    const ok = response?.data && (response.data.code === 0 || response.data.success === true);

    if (!ok) {
      return api.sendMessage('❌ Không tìm thấy thông tin người dùng TikTok.', threadId, type);
    }

    const ud = response.data?.data?.user || {};
    const st = response.data?.data?.stats || {};

    const profileUrl = ud.uniqueId ? `https://www.tiktok.com/@${ud.uniqueId}` : `https://www.tiktok.com/@${username}`;

    const lines = [];
    lines.push('🎵 TIKTOK INFO');
    lines.push(`- Tên: ${ud.nickname || '—'}`);
    lines.push(`- Username: @${ud.uniqueId || username}${ud.verified ? ' ✓' : ''}`);
    if (ud.signature) lines.push(`- Bio: ${ud.signature}`);
    lines.push(`- Followers: ${formatNumber(st.followerCount)}`);
    lines.push(`- Following: ${formatNumber(st.followingCount)}`);
    lines.push(`- Likes/Hearts: ${formatNumber(st.heartCount)}`);
    lines.push(`- Videos: ${formatNumber(st.videoCount)}`);
    lines.push(`- Riêng tư: ${ud.privateAccount ? 'Có' : 'Không'}`);
    if (ud.id) lines.push(`- ID: ${ud.id}`);
    if (ud.avatarLarger || ud.avatarMedium || ud.avatarThumb) {
      lines.push(`- Avatar: ${ud.avatarLarger || ud.avatarMedium || ud.avatarThumb}`);
    }
    lines.push(`- Link: ${profileUrl}`);

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('⚠️ Có lỗi xảy ra: ' + (e?.message || e), threadId, type);
  }
};
