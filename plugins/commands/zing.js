const fs = require("fs");
const path = require("path");
const axios = require("axios");

const zing = require(path.join(__dirname, "..", "..", "utils", "zingmp3.js"));
const { processAudio } = require("../../utils/index");

const AUDIO_CACHE_DIR = path.join(__dirname, "..", "..", "cache", "zing");

function ensureCacheDir() {
  if (!fs.existsSync(AUDIO_CACHE_DIR)) {
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
  }
}

function isIdQuery(raw) {
  return /^id[:=]/i.test(raw);
}

function extractId(raw) {
  return raw.replace(/^id[:=]/i, "").trim();
}

function normalizeQuery(args = []) {
  return args.join(" ").trim();
}

function formatDuration(duration) {
  if (typeof duration !== "number" || Number.isNaN(duration)) return "Không rõ";
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatArtists(artists = []) {
  if (!Array.isArray(artists) || artists.length === 0) return "Không rõ";
  return artists
    .map((artist) => artist?.name)
    .filter(Boolean)
    .join(", ");
}

async function resolveSong(query) {
  if (!query) {
    throw new Error("Thiếu từ khóa hoặc ID bài hát");
  }

  if (isIdQuery(query)) {
    const id = extractId(query);
    if (!id) throw new Error("ID bài hát không hợp lệ");
    const data = await zing.getFullInfo(id);
    return { info: data, streaming: data?.streaming };
  }

  const searchResult = await zing.search(query);
  const songItems = searchResult?.song?.items;
  if (!Array.isArray(songItems) || songItems.length === 0) {
    return null;
  }

  const firstSong = songItems[0];
  const id = firstSong?.encodeId;
  if (!id) {
    return null;
  }

  const data = await zing.getFullInfo(id);
  return { info: data, streaming: data?.streaming };
}

async function downloadAudio(url) {
  if (!url) return null;
  try {
    ensureCacheDir();
    const filename = `zing_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    const filepath = path.join(AUDIO_CACHE_DIR, filename);
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    fs.writeFileSync(filepath, Buffer.from(response.data));
    return filepath;
  } catch (error) {
    console.warn("[zing] Lỗi tải audio:", error?.message || error);
    return null;
  }
}

module.exports.config = {
  name: "zing",
  aliases: [],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tra cứu và phát thử bài hát từ Zing MP3",
  category: "Tiện ích",
  usage: "zing <từ khóa|id:encodeId>",
  cooldowns: 5,
  dependencies: { axios: "" }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;

  if (!Array.isArray(args) || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập từ khóa hoặc ID bài hát. Ví dụ: zing id:ZWA7O7CU", threadId, type);
  }

  const query = normalizeQuery(args);

  try {
    const result = await resolveSong(query);

    if (!result || !result.info) {
      return api.sendMessage(`❌ Không tìm thấy bài hát phù hợp với "${query}".`, threadId, type);
    }

    const info = result.info;
    const streaming = result.streaming || {};
    const audioUrl = streaming["320"] || streaming["128"] || null;

    const messageLines = [
      `🎵 ${info?.title || "Bài hát không tên"}`,
      `🎤 Ca sĩ: ${formatArtists(info?.artists)}`,
      info?.album?.title ? `💿 Album: ${info.album.title}` : null,
      typeof info?.duration === "number" ? `⏱️ Thời lượng: ${formatDuration(info.duration)}` : null,
      info?.releaseDate ? `📅 Phát hành: ${info.releaseDate}` : null,
      info?.link ? `🔗 ${info.link}` : null,
    ].filter(Boolean);

    await api.sendMessage(messageLines.join("\n"), threadId, type);

    if (!audioUrl) {
      return;
    }

    const audioPath = await downloadAudio(audioUrl);
    if (!audioPath) {
      return;
    }

    try {
      const voiceUrl = await processAudio(audioPath, threadId, type);
      if (!voiceUrl) {
        return;
      }

      await api.sendVoice({ voiceUrl, ttl: 300000 }, threadId, type);
    } catch (audioError) {
      console.error("[zing] Lỗi gửi audio:", audioError?.message || audioError);
    }
  } catch (error) {
    const status = error?.response?.err;
    let message = "❌ Không thể truy xuất dữ liệu từ Zing MP3. Vui lòng thử lại sau.";

    if (status === -201) {
      message = "⚠️ API Zing MP3 yêu cầu bạn thử lại sau do quá tải.";
    }

    console.error("[zing] Lỗi xử lý yêu cầu:", error?.response || error?.message || error);
    return api.sendMessage(message, threadId, type);
  }
};
