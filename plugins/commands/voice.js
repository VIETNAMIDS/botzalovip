const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const googleTTS = require("google-tts-api");
const { processAudio } = require("../../utils/index");

ffmpeg.setFfmpegPath(ffmpegStatic);

module.exports.config = {
  name: "voice",
  aliases: ["tts", "doc", "noichu"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Chuyển text/tin nhắn thành voice (TTS)",
  category: "Tiện ích",
  usage: "voice [-lang vi|en] [-slow 0|1] <text> (hoặc reply tin nhắn)",
  cooldowns: 3,
  dependencies: { axios: "", "google-tts-api": "", "fluent-ffmpeg": "", "ffmpeg-static": "" }
};

const TEMP_DIR = path.join(process.cwd(), "temp", "tts");

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(args = []) {
  const opts = { lang: "vi", slow: false };
  const rest = [];

  for (let i = 0; i < args.length; i++) {
    const tok = String(args[i] ?? "");
    if (tok === "-lang" || tok === "--lang") {
      const v = String(args[i + 1] ?? "").trim();
      if (v) opts.lang = v;
      i++;
      continue;
    }
    if (tok === "-slow" || tok === "--slow") {
      const v = String(args[i + 1] ?? "0").trim();
      opts.slow = v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "on";
      i++;
      continue;
    }
    rest.push(tok);
  }

  return { opts, text: rest.join(" ").trim() };
}

function splitText(text, maxLen = 180) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const parts = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const remain = cleaned.slice(cursor);
    if (remain.length <= maxLen) {
      parts.push(remain);
      break;
    }
    let cut = remain.lastIndexOf(" ", maxLen);
    if (cut < Math.floor(maxLen * 0.5)) cut = maxLen;
    parts.push(remain.slice(0, cut).trim());
    cursor += cut;
  }

  return parts.filter(Boolean);
}

function getTextFromReply(event) {
  const reply = event?.messageReply || event?.data?.quote;
  if (!reply) return "";
  const data = reply?.data || {};
  const candidates = [
    reply?.text,
    reply?.body,
    reply?.message,
    reply?.msg,
    data?.text,
    data?.body,
    data?.message,
    data?.msg,
    data?.content,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

async function downloadMp3(url, outPath) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  fs.writeFileSync(outPath, Buffer.from(res.data));
  return outPath;
}

function concatMp3Files(inputs, outputPath) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(inputs) || inputs.length === 0) return reject(new Error("No inputs"));
    if (inputs.length === 1) {
      fs.copyFileSync(inputs[0], outputPath);
      return resolve(outputPath);
    }

    const listPath = path.join(TEMP_DIR, `tts_concat_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    const content = inputs
      .map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`)
      .join(os.EOL);
    fs.writeFileSync(listPath, content, "utf8");

    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .on("end", () => {
        try { fs.unlinkSync(listPath); } catch {}
        resolve(outputPath);
      })
      .on("error", (err) => {
        try { fs.unlinkSync(listPath); } catch {}
        reject(err);
      })
      .save(outputPath);
  });
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event || {};

  const { opts, text: argText } = parseArgs(args);
  const replyText = getTextFromReply(event);
  const text = (argText || replyText || "").trim();

  if (!text) {
    return api.sendMessage(
      "❌ Bạn chưa nhập nội dung.\nDùng: voice <text> hoặc reply tin nhắn rồi gõ voice\nTuỳ chọn: -lang vi|en, -slow 0|1",
      threadId,
      type
    );
  }

  const maxInput = 2000;
  const finalText = text.length > maxInput ? text.slice(0, maxInput) : text;

  ensureDirSync(TEMP_DIR);

  const parts = splitText(finalText, 180);
  if (!parts.length) {
    return api.sendMessage("❌ Nội dung không hợp lệ.", threadId, type);
  }

  const tempFiles = [];
  let mergedMp3 = null;

  try {
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i];
      const url = googleTTS.getAudioUrl(t, {
        lang: opts.lang || "vi",
        slow: Boolean(opts.slow),
        host: "https://translate.google.com",
      });
      const mp3Path = path.join(TEMP_DIR, `tts_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.mp3`);
      await downloadMp3(url, mp3Path);
      tempFiles.push(mp3Path);
    }

    mergedMp3 = path.join(TEMP_DIR, `tts_merged_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    await concatMp3Files(tempFiles, mergedMp3);

    const voiceUrl = await processAudio(mergedMp3, threadId, type, api);
    await api.sendVoice({ voiceUrl, ttl: 360000 }, threadId, type);
  } catch (error) {
    console.error("[voice/tts] Lỗi:", error?.message || error);
    return api.sendMessage(`❌ Lỗi TTS: ${error?.message || error}`, threadId, type);
  } finally {
    for (const f of tempFiles) safeUnlink(f);
    safeUnlink(mergedMp3);
  }
};
