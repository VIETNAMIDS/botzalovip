const axios = require("axios");
const crypto = require("crypto");

const URL_API = "https://zingmp3.vn";
const API_KEY = "88265e23d4284f25963e6eedac8fbfa3";
const SECRET_KEY = "2aa2d1c561e809b267f3638c4a307aab";
const VERSION = "1.4.2";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cachedCookie = null;

function pickCookieFromHeaders(headers = {}) {
  const setCookie = headers["set-cookie"];
  if (!Array.isArray(setCookie) || setCookie.length === 0) {
    return null;
  }
  return setCookie
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function ensureCookie() {
  if (cachedCookie) {
    return cachedCookie;
  }
  try {
    const response = await axios.get(URL_API, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: URL_API,
      },
      timeout: 10000,
    });
    const cookie = pickCookieFromHeaders(response?.headers);
    if (cookie) {
      cachedCookie = cookie;
    }
  } catch (error) {
    console.warn("[zingmp3] Không thể lấy cookie ban đầu:", error?.message || error);
  }
  return cachedCookie;
}

function buildParamString(params = {}) {
  const searchParams = new URLSearchParams();
  Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .forEach((key) => {
      searchParams.append(key, params[key]);
    });
  return searchParams.toString();
}

function getHash256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getHmac512(str, key) {
  return crypto.createHmac("sha512", key).update(str).digest("hex");
}

async function requestZing({ path, params = {}, haveParam = 0 }) {
  const cookie = await ensureCookie();
  const ctime = Math.floor(Date.now() / 1000);
  const paramString = buildParamString(params);
  const baseHash = `ctime=${ctime}`;
  const hash256 = getHash256(baseHash + (haveParam === 0 ? paramString : ""));
  const sig = getHmac512(path + hash256, SECRET_KEY);

  const finalParams = {
    ...params,
    ctime,
    version: VERSION,
    sig,
    apiKey: API_KEY,
  };

  const headers = {
    "User-Agent": USER_AGENT,
    Referer: `${URL_API}/`,
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await axios.get(path, {
    baseURL: URL_API,
    params: finalParams,
    headers,
    timeout: 10000,
  });

  if (response?.data?.err && response.data.err !== 0) {
    const message = response.data?.msg || `ZingMp3 API error ${response.data.err}`;
    const error = new Error(message);
    error.response = response?.data;
    throw error;
  }

  return response?.data?.data || null;
}

async function getInfoMusic(id) {
  if (!id) throw new Error("Thiếu mã bài hát");
  return requestZing({ path: "/api/v2/song/get/info", params: { id } });
}

async function getStreaming(id) {
  if (!id) throw new Error("Thiếu mã bài hát");
  return requestZing({ path: "/api/v2/song/get/streaming", params: { id } });
}

async function getFullInfo(id) {
  const [info, streaming] = await Promise.all([getInfoMusic(id), getStreaming(id)]);
  return { ...info, streaming };
}

async function search(keyword) {
  if (!keyword) throw new Error("Thiếu từ khóa tìm kiếm");
  return requestZing({
    path: "/api/v2/search/multi",
    params: { q: keyword },
    haveParam: 1,
  });
}

module.exports = {
  getInfoMusic,
  getStreaming,
  getFullInfo,
  search,
};
