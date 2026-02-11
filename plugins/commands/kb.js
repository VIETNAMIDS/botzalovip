const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { processAudio } = require("../../utils/index");

const TEMP_DIR = path.join(__dirname, "..", "..", "cache", "dict");

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

module.exports.config = {
  name: "define",
  aliases: ["dict", "dictionary"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tra cứu nghĩa tiếng Anh qua dictionaryapi.dev",
  category: "Tiện ích",
  usage: "define <từ tiếng Anh>",
  cooldowns: 3
};

function formatPhonetics(phonetics = []) {
  const items = phonetics
    .map((item) => {
      const text = item?.text ? item.text.trim() : null;
      const audio = item?.audio ? item.audio.trim() : null;
      if (!text && !audio) return null;
      if (text && audio) {
        return `${text} (${audio})`;
      }
      return text || audio;
    })
    .filter(Boolean);

  if (!items.length) return "Không có";
  return items.join(" | ");
}

function formatDefinitions(meanings = []) {
  if (!Array.isArray(meanings) || meanings.length === 0) {
    return "Không tìm thấy định nghĩa.";
  }

  const chunks = [];

  meanings.forEach((meaning, meaningIndex) => {
    const part = meaning?.partOfSpeech || `Nghĩa ${meaningIndex + 1}`;
    const definitions = Array.isArray(meaning?.definitions)
      ? meaning.definitions.slice(0, 3)
      : [];

    if (definitions.length === 0) {
      return;
    }

    chunks.push(`• ${part}`);

    definitions.forEach((definitionObj, index) => {
      const def = definitionObj?.definition || "Không có mô tả";
      const example = definitionObj?.example ? `\n> Ví dụ: ${definitionObj.example}` : "";
      const synonyms =
        Array.isArray(definitionObj?.synonyms) && definitionObj.synonyms.length > 0
          ? `\n> Đồng nghĩa: ${definitionObj.synonyms.slice(0, 5).join(", ")}`
          : "";
      chunks.push(`   ${index + 1}. ${def}${example}${synonyms}`);
    });
  });

  return chunks.length ? chunks.join("\n") : "Không tìm thấy định nghĩa.";
}

async function downloadPronunciationAudio(url) {
  try {
    ensureTempDir();
    const extension = path.extname(url.split("?")[0] || "").toLowerCase() || ".mp3";
    const safeExt = extension.includes(".") ? extension : ".mp3";
    const filePath = path.join(
      TEMP_DIR,
      `dict_${Date.now()}_${Math.random().toString(36).slice(2)}${safeExt}`
    );

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000
    });

    fs.writeFileSync(filePath, Buffer.from(response.data));
    return filePath;
  } catch (error) {
    console.error("[DEFINE] Lỗi tải audio phát âm:", error?.message || error);
    return null;
  }
}

function pickPronunciationAudio(phonetics = []) {
  if (!Array.isArray(phonetics)) return null;
  for (const item of phonetics) {
    const audio = typeof item?.audio === "string" ? item.audio.trim() : "";
    if (audio && audio.startsWith("http")) {
      return audio;
    }
  }
  return null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const query = (args || []).join(" ").trim();

  if (!query) {
    return api.sendMessage(
      "❌ Bạn cần nhập từ tiếng Anh cần tra. Ví dụ: define hello",
      threadId,
      type
    );
  }

  const word = query.split(" ")[0].toLowerCase();
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

  try {
    const response = await axios.get(url, { timeout: 10000 });
    const data = Array.isArray(response?.data) ? response.data[0] : null;

    if (!data) {
      return api.sendMessage(
        `❌ Không tìm thấy kết quả cho "${word}".`,
        threadId,
        type
      );
    }

    const phonetics = formatPhonetics(data.phonetics);
    const meanings = formatDefinitions(data.meanings);

    const message = [
      `📘 TỪ ĐIỂN: ${data.word || word}`,
      `🔊 Phiên âm: ${phonetics}`,
      "📚 Nghĩa:",
      meanings
    ].join("\n");

    await api.sendMessage(message, threadId, type);

    const pronunciationUrl = pickPronunciationAudio(data.phonetics);
    if (!pronunciationUrl) {
      return;
    }

    const audioPath = await downloadPronunciationAudio(pronunciationUrl);
    if (!audioPath) {
      return;
    }

    try {
      const voiceUrl = await processAudio(audioPath, threadId, type);
      if (!voiceUrl) {
        return;
      }

      await api.sendVoice({ voiceUrl, ttl: 300000 }, threadId, type);
    } catch (voiceError) {
      console.error("[DEFINE] Lỗi gửi voice phát âm:", voiceError?.message || voiceError);
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      return api.sendMessage(
        `❌ Không tìm thấy kết quả cho "${word}".`,
        threadId,
        type
      );
    }

    console.error("[DEFINE] Lỗi gọi dictionaryapi:", error);
    return api.sendMessage(
      "❌ Không thể tra cứu từ điển lúc này. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
};
