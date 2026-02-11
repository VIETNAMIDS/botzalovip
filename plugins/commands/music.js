const fs = require('fs');
const path = require('path');

const { registerSelection, handleReplySelection, triggerSelectionByUser } = require('../utils/musicSelections');
const { collectMessageIds } = require('../utils/messageUtils');
const { createSearchResultImage } = require('../utils/searchCanvas');

function parseArgs(args = []) {
  const tokens = Array.isArray(args) ? args.map(String) : [];
  const lower = tokens.map((t) => t.toLowerCase());

  const opts = {
    source: null,
    limit: 20,
    lyric: false,
    avatar: null,
    buttonText: null,
  };

  const queryParts = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tl = lower[i];

    if (tl === '-s' || tl === '--source') {
      const v = tokens[i + 1];
      if (v) {
        opts.source = String(v).toLowerCase();
        i++;
      }
      continue;
    }

    if (tl.startsWith('source=')) {
      opts.source = tl.split('=').slice(1).join('=');
      continue;
    }

    if (tl === '-l' || tl === '--limit') {
      const v = Number(tokens[i + 1]);
      if (Number.isFinite(v)) opts.limit = Math.max(1, Math.min(50, Math.floor(v)));
      i++;
      continue;
    }

    if (tl === '-a' || tl === '--avatar') {
      const v = tokens[i + 1];
      if (v) {
        opts.avatar = String(v);
        i++;
      }
      continue;
    }

    if (tl.startsWith('avatar=')) {
      opts.avatar = t.split('=').slice(1).join('=');
      continue;
    }

    if (tl === '-b' || tl === '--button') {
      const v = tokens[i + 1];
      if (v) {
        opts.buttonText = String(v);
        i++;
      }
      continue;
    }

    if (tl.startsWith('button=')) {
      opts.buttonText = t.split('=').slice(1).join('=');
      continue;
    }

    if (tl.startsWith('limit=')) {
      const v = Number(tl.split('=').slice(1).join('='));
      if (Number.isFinite(v)) opts.limit = Math.max(1, Math.min(50, Math.floor(v)));
      continue;
    }

    if (tl === 'lyric' || tl === 'lyrics') {
      opts.lyric = true;
      continue;
    }

    queryParts.push(t);
  }

  return { opts, query: queryParts.join(' ').trim() };
}

function isNumberToken(token) {
  return /^\d+$/.test(String(token || '').trim());
}

function normalizeTrackForCanvas(track) {
  return {
    title: track.title,
    artistsNames: track.artistsNames || track.artist,
    duration: Number(track.duration) || 0,
    listen: Number(track.listen) || Number(track.playCount) || 0,
    like: Number(track.like) || Number(track.likeCount) || 0,
    thumbnailM: track.thumbnailM || track.thumbnail,
    source: track.platform ? String(track.platform).toUpperCase() : undefined,
  };
}

function displaySourceName(source) {
  if (!source) return '';
  if (source === 'sc' || source === 'soundcloud') return 'SoundCloud';
  if (source === 'zing' || source === 'zingmp3') return 'ZingMP3';
  return String(source);
}

function mapSourceArg(source) {
  if (!source) return null;
  const s = String(source).toLowerCase();
  if (s === 'sc' || s === 'soundcloud') return 'soundcloud';
  if (s === 'zing' || s === 'zingmp3') return 'zingmp3';
  if (s === 'yt' || s === 'youtube') return 'youtube';
  return s;
}

function mergeAndRankResults({ zing = [], soundcloud = [], youtube = [], limit = 20 }) {
  const merged = [];

  const z = Array.isArray(zing) ? zing : [];
  const sc = Array.isArray(soundcloud) ? soundcloud : [];
  const yt = Array.isArray(youtube) ? youtube : [];

  for (const item of z) {
    if (!item) continue;
    merged.push({
      platform: 'zingmp3',
      title: item.title,
      artistsNames: item.artistsNames,
      duration: item.duration,
      listen: item.listen,
      like: item.like,
      thumbnailM: item.thumbnailM || item.thumbnail,
      raw: item,
    });
  }

  for (const item of sc) {
    if (!item) continue;
    merged.push({
      platform: 'soundcloud',
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      playCount: item.playCount,
      likeCount: item.likeCount,
      thumbnail: item.thumbnail,
      raw: item,
    });
  }

  for (const item of yt) {
    if (!item) continue;
    merged.push({
      platform: 'youtube',
      title: item.title,
      artist: item.channel,
      duration: item.duration,
      playCount: item.viewCount,
      likeCount: item.likeCount,
      thumbnail: item.thumbnail,
      raw: item,
    });
  }

  // simple ranking: prefer higher listen/playCount then like
  merged.sort((a, b) => {
    const aListen = Number(a.listen || a.playCount || 0);
    const bListen = Number(b.listen || b.playCount || 0);
    if (bListen !== aListen) return bListen - aListen;
    const aLike = Number(a.like || a.likeCount || 0);
    const bLike = Number(b.like || b.likeCount || 0);
    return bLike - aLike;
  });

  return merged.slice(0, Math.max(1, Math.min(50, Number(limit) || 20)));
}

async function loadProviders() {
  const zing = require('./zingmp3');
  const sc = require('./soundcloud');
  const yt = require('./youtube');

  const providers = new Map();
  if (zing?.provider?.platform) providers.set(zing.provider.platform, zing.provider);
  if (sc?.provider?.platform) providers.set(sc.provider.platform, sc.provider);
  if (yt?.provider?.platform) providers.set(yt.provider.platform, yt.provider);

  return providers;
}

async function musicCommand({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event.senderID || event.authorId);

  if (!Array.isArray(args) || args.length === 0) {
    await api.sendMessage({
      msg: '❗ Cách dùng:\n- music <từ khóa>\n- music <số> (chọn lại danh sách gần nhất)\n- music --source zing|sc <từ khóa>\n- music <từ khóa> lyric\n- music --avatar <url|path> <từ khóa>',
      ttl: 60000,
    }, threadId, type);
    return;
  }

  // allow selecting by number without reply
  if (isNumberToken(args[0])) {
    const handled = await triggerSelectionByUser(threadId, senderId, args.join(' '), api, event, 'music');
    if (!handled) {
      await api.sendMessage({ msg: '⚠️ Không tìm thấy danh sách nhạc gần đây. Hãy tìm kiếm lại bằng music <từ khóa>.', ttl: 30000 }, threadId, type);
    }
    return;
  }

  const { opts, query } = parseArgs(args);
  if (!query) {
    await api.sendMessage({ msg: '❌ Thiếu từ khóa tìm nhạc.', ttl: 30000 }, threadId, type);
    return;
  }

  const providers = await loadProviders();
  const wantedPlatform = mapSourceArg(opts.source);

  const sourcesToSearch = [];
  if (wantedPlatform) {
    if (providers.has(wantedPlatform)) sourcesToSearch.push(wantedPlatform);
  } else {
    // default: search both
    if (providers.has('zingmp3')) sourcesToSearch.push('zingmp3');
    if (providers.has('soundcloud')) sourcesToSearch.push('soundcloud');
    if (providers.has('youtube')) sourcesToSearch.push('youtube');
  }

  if (sourcesToSearch.length === 0) {
    await api.sendMessage({ msg: '❌ Không có nguồn nhạc khả dụng (zingmp3/soundcloud/youtube).', ttl: 30000 }, threadId, type);
    return;
  }

  const sourceLabel = wantedPlatform ? displaySourceName(wantedPlatform) : 'ZingMP3 + SoundCloud + YouTube';
  await api.sendMessage({ msg: `🔍 Đang tìm "${query}" (${sourceLabel})...`, ttl: 60000 }, threadId, type);

  const resultsByPlatform = {};
  await Promise.all(sourcesToSearch.map(async (platform) => {
    const provider = providers.get(platform);
    try {
      const res = await provider.search(query, opts.limit);
      resultsByPlatform[platform] = Array.isArray(res) ? res : [];
    } catch (e) {
      resultsByPlatform[platform] = [];
    }
  }));

  const merged = mergeAndRankResults({
    zing: resultsByPlatform.zingmp3,
    soundcloud: resultsByPlatform.soundcloud,
    youtube: resultsByPlatform.youtube,
    limit: opts.limit,
  });

  if (!merged.length) {
    await api.sendMessage({ msg: `❌ Không tìm thấy kết quả cho "${query}".`, ttl: 30000 }, threadId, type);
    return;
  }

  const canvasInput = merged.map((t) => normalizeTrackForCanvas(t));
  const defaultAvatar = path.join(process.cwd(), 'assets', 'bi_bon.png');
  const imagePath = await createSearchResultImage(canvasInput, {
    template: 'zing',
    title: `Music • ${query}`,
    avatar: opts.avatar || defaultAvatar,
    buttonText: opts.buttonText || 'NhacCuaTui',
  });

  let sent;
  if (imagePath) {
    sent = await api.sendMessage({ msg: '', attachments: [imagePath], ttl: 120000 }, threadId, type);
  } else {
    const lines = [`🎧 Kết quả tìm nhạc: ${query}`];
    merged.forEach((t, idx) => {
      const artist = t.artistsNames || t.artist || 'Không rõ';
      lines.push(`${idx + 1}. ${t.title} (${t.platform})`);
      lines.push(`   👤 ${artist}`);
    });
    lines.push('\n👉 Reply số để chọn bài (ví dụ: 1)');
    sent = await api.sendMessage({ msg: lines.join('\n'), ttl: 120000 }, threadId, type);
  }

  const messageIds = collectMessageIds(sent);

  registerSelection({
    messageIds,
    threadId,
    senderId,
    platform: 'music',
    items: merged,
    ttl: 120000,
    metadata: {
      imagePath,
      query,
      modifiers: opts.lyric ? ['lyric'] : [],
    },
    async onSelect({ index, modifiers, api: execApi, event: execEvent, record }) {
      const targetIndex = index - 1;
      if (targetIndex < 0 || targetIndex >= record.items.length) {
        await execApi.sendMessage({ msg: '⚠️ Số thứ tự không hợp lệ.', ttl: 20000 }, record.threadId, execEvent?.type ?? type);
        return true;
      }

      const chosen = record.items[targetIndex];
      const providersInner = await loadProviders();
      const provider = providersInner.get(chosen.platform);
      if (!provider) {
        await execApi.sendMessage({ msg: `❌ Nguồn ${chosen.platform} không khả dụng.`, ttl: 20000 }, record.threadId, execEvent?.type ?? type);
        return true;
      }

      const finalModifiers = Array.isArray(modifiers) && modifiers.length ? modifiers : (record.metadata?.modifiers || []);
      try {
        await provider.play({ api: execApi, event: execEvent || event, item: chosen.raw, modifiers: finalModifiers });
      } finally {
        if (record.metadata?.imagePath) {
          fs.promises.unlink(record.metadata.imagePath).catch(() => {});
        }
      }
      return true;
    },
  });

  if (imagePath) {
    const timer = setTimeout(() => {
      fs.promises.unlink(imagePath).catch(() => {});
    }, 130000);
    if (typeof timer.unref === 'function') timer.unref();
  }
}

module.exports = {
  config: {
    name: 'music',
    aliases: ['nhac', 'm', 'song'],
    version: '1.0.0',
    role: 0,
    author: 'Cascade',
    description: 'Tìm nhạc đa nguồn (ZingMP3 + SoundCloud) và reply số để phát',
    category: 'Âm nhạc',
    cooldowns: 5,
  },
  run: musicCommand,
  handleEvent: async ({ api, event }) => handleReplySelection(api, event, 'music'),
};
