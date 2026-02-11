const axios = require("axios");

const SPOTIFY_TOKEN = process.env.SPOTIFY_TOKEN || "BQAJCcJiauBxoz11eDJws5c3jAlECsJoIptlyisFVLIC5fXwExKy4AQzF4TaZ2kCC4gx0bL8PDxJK0TNrResZ9BVU95wNjPxWSL3x82bFDoMu_IvVABtm4l7GB1p7d01alDYY3A-Db_oZbjjH47M6UMRJiz3oy_xy1D1yhwiQD9Ui5eOSdlhXjcr4TsF1SyUoTEjtx4ZDT8vxUdWS6yYQf06KfBL-yBlpCHuwCgOC2uNd5hWG88BeZZ4tSKzCSXT2isFQyr9HyBEMRdb9-4yGoRqwo0H0sCnzKuLvYNBtebs9jH-R4LfEerbM2xgwijaIS41";

const VALID_TIME_RANGES = ["short_term", "medium_term", "long_term"];
const DEFAULT_TIME_RANGE = "long_term";
const DEFAULT_LIMIT = 5;

module.exports.config = {
  name: "spotifytop",
  aliases: ["spotify", "spotitracks"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Lấy danh sách bài hát yêu thích nhất từ Spotify",
  category: "Tiện ích",
  usage: "spotifytop [short_term|medium_term|long_term] [limit 1-50] [token=BearerToken]",
  cooldowns: 5,
  dependencies: {
    axios: ""
  }
};

async function fetchTopTracks(token, timeRange, limit) {
  const endpoint = `https://api.spotify.com/v1/me/top/tracks?time_range=${encodeURIComponent(
    timeRange
  )}&limit=${limit}`;

  const response = await axios.get(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    timeout: 10000
  });

  return Array.isArray(response?.data?.items) ? response.data.items : [];
}

function parseArguments(rawArgs = []) {
  const args = [...rawArgs];
  let token = SPOTIFY_TOKEN;
  let timeRange = DEFAULT_TIME_RANGE;
  let limit = DEFAULT_LIMIT;

  const tokenArgIndex = args.findIndex((item) => item.startsWith("token="));
  if (tokenArgIndex !== -1) {
    const [, value = ""] = args[tokenArgIndex].split("=");
    if (value) {
      token = value;
    }
    args.splice(tokenArgIndex, 1);
  }

  if (args.length > 0) {
    const maybeRange = args[0].toLowerCase();
    if (VALID_TIME_RANGES.includes(maybeRange)) {
      timeRange = maybeRange;
      args.shift();
    }
  }

  if (args.length > 0) {
    const parsed = parseInt(args[0], 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 50) {
      limit = parsed;
    }
  }

  return { token, timeRange, limit };
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const { token, timeRange, limit } = parseArguments(args);

  if (!token) {
    return api.sendMessage(
      "❌ Bạn cần cung cấp token Spotify hợp lệ. Dùng cú pháp: spotifytop token=YOUR_TOKEN",
      threadId,
      type
    );
  }

  try {
    const tracks = await fetchTopTracks(token, timeRange, limit);

    if (!tracks.length) {
      return api.sendMessage(
        "ℹ️ Không tìm thấy bài hát nào trong khoảng thời gian yêu cầu.",
        threadId,
        type
      );
    }

    const lines = tracks.map((track, index) => {
      const title = track?.name || "Không rõ";
      const artists = Array.isArray(track?.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean).join(", ") || "Không rõ"
        : "Không rõ";
      const album = track?.album?.name ? `\n   Album: ${track.album.name}` : "";
      const url = track?.external_urls?.spotify ? `\n   🔗 ${track.external_urls.spotify}` : "";

      return `${index + 1}. ${title} – ${artists}${album}${url}`;
    });

    const prettyRange = timeRange.replace("_term", "").replace("_", " ");
    const header = `🎧 Top ${tracks.length} bài hát Spotify (${prettyRange})`;
    const message = [header, "", ...lines].join("\n");

    return api.sendMessage(message, threadId, type);
  } catch (error) {
    const status = error?.response?.status;

    let errorMessage = "❌ Không thể lấy danh sách bài hát. Vui lòng kiểm tra token và thử lại.";
    if (status === 401) {
      errorMessage = "❌ Token Spotify không hợp lệ hoặc đã hết hạn. Tạo token mới rồi chạy: spotifytop token=TOKEN";
    } else if (status === 429) {
      errorMessage = "⚠️ Spotify đang giới hạn số lần gọi API. Thử lại sau ít phút.";
    }

    console.error("[SPOTIFY TOP] Lỗi gọi API Spotify:", error?.response?.data || error?.message || error);

    return api.sendMessage(errorMessage, threadId, type);
  }
};

module.exports.fetchTopTracks = fetchTopTracks;
