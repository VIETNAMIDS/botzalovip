const fs = require("fs");
const fsPromises = require('fs').promises;
const path = require("path");
const logger = require("./logger");
const YAML = require("yaml");
const getVideoInfo = require('get-video-info');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const QRCode = require("qrcode");
const jsQR = require("jsqr");
const Jimp = require("jimp");
const childRental = require("./childRental");
const childCommandPolicy = require("./childCommandPolicy");

function saveBase64Image(base64String, outputPath) {
    const matches = base64String.match(/^data:(image\/\w+);base64,(.+)$/);
    let base64Data = base64String;

    if (matches) {
        base64Data = matches[2];
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    fs.writeFileSync(outputPath, Buffer.from(base64Data, "base64"));
}

function normalizeAdminList(list) {
    return Array.from(
        new Set(
            (Array.isArray(list) ? list : [])
                .map((id) => (id != null ? id.toString().trim() : ""))
                .filter(Boolean)
        )
    );
}

async function pruneConfigAdmins(apiInstance) {
    try {
        const configPath = path.join(__dirname, "..", "config.yml");
        if (!fs.existsSync(configPath)) {
            logger.log("[Bonz] Không tìm thấy config.yml để dọn dẹp admin.", "warn");
            return;
        }

        const rawConfig = fs.readFileSync(configPath, "utf8");
        const yaml = YAML.parse(rawConfig) || {};

        const admins = normalizeAdminList(yaml.admin_bot);
        const owners = normalizeAdminList(yaml.owner_bot);

        const totalBefore = admins.length + owners.length;
        if (totalBefore === 0) {
            logger.log("[Bonz] Không có ID admin/owner để dọn dẹp.", "info");
            return;
        }

        logger.log("Bonz đang dọn dẹp ID không tồn tại...", "info");

        const combined = normalizeAdminList([...admins, ...owners]);
        const validIds = new Set();
        const invalidIds = new Set();
        const chunkSize = 20;

        for (let i = 0; i < combined.length; i += chunkSize) {
            const chunk = combined.slice(i, i + chunkSize);
            try {
                const info = await apiInstance.getUserInfo(chunk);
                const returnedIds = new Set([
                    ...Object.keys(info?.unchanged_profiles || {}),
                    ...Object.keys(info?.changed_profiles || {}),
                ]);

                chunk.forEach((id) => {
                    if (returnedIds.has(id)) {
                        validIds.add(id);
                    } else {
                        invalidIds.add(id);
                    }
                });
            } catch (error) {
                logger.log(`[Bonz] Không thể kiểm tra admin IDs: ${error?.message || error}`, "warn");
                chunk.forEach((id) => validIds.add(id));
            }
        }

        if (invalidIds.size === 0) {
            logger.log(`[Bonz] Không phát hiện ID lạ. Vẫn còn ${combined.length} ID hợp lệ.`, "info");
            return;
        }

        const cleanedAdmins = admins.filter((id) => validIds.has(id));
        const cleanedOwners = owners.filter((id) => validIds.has(id));

        updateConfigArray("admin_bot", cleanedAdmins);
        updateConfigArray("owner_bot", cleanedOwners);

        if (global.config) {
            global.config.admin_bot = cleanedAdmins;
            global.config.owner_bot = cleanedOwners;
        }
        if (global.users) {
            if (!global.users.admin) global.users.admin = [];
            if (!global.users.owner) global.users.owner = [];
            global.users.admin = cleanedAdmins.slice();
            global.users.owner = cleanedOwners.slice();
        }

        logger.log(
            `Bonz đã xóa ${invalidIds.size} ID lạ và còn ${cleanedAdmins.length + cleanedOwners.length} / ${totalBefore} ID hợp lệ.`,
            "info"
        );
    } catch (error) {
        logger.log(`[Bonz] Lỗi dọn dẹp admin: ${error?.message || error}`, "error");
    }
}

const getJsonData = (filePath, defaultData = {}) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
        logger.log(`File ${path.basename(filePath)} chưa tồn tại, tạo mới.`, "warn");
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), "utf8");
        return defaultData;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
};
function convertTimestamp(timestamp) {
    const date = new Date(Number(timestamp));
    return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
// ADMIN HELPERS
function getMotherBotAdmins() {
    try {
        const uniqueIds = new Set();

        const configAdmins = Array.isArray(global?.config?.admin_bot) ? global.config.admin_bot : [];
        configAdmins.forEach((id) => {
            if (id !== undefined && id !== null) uniqueIds.add(String(id));
        });

        const globalAdmins = Array.isArray(global?.users?.admin) ? global.users.admin : [];
        globalAdmins.forEach((id) => {
            if (id !== undefined && id !== null) uniqueIds.add(String(id));
        });

        const fallbackPath = path.join(__dirname, "..", "assets", "data", "list_admin.json");
        if (fs.existsSync(fallbackPath)) {
            try {
                const raw = fs.readFileSync(fallbackPath, "utf8");
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach((id) => {
                        if (id !== undefined && id !== null) uniqueIds.add(String(id));
                    });
                }
            } catch (error) {
                logger.log(`Không thể đọc list_admin.json: ${error.message || error}`, "warn");
            }
        }

        return Array.from(uniqueIds);
    } catch (error) {
        logger.log(`Lỗi khi lấy danh sách admin bot mẹ: ${error.message || error}`, "warn");
        return [];
    }
}
// CONFIG
function updateConfigArray(key, newArray) {
    const configPath = path.join(__dirname, "..", "config.yml");
    const lines = fs.readFileSync(configPath, "utf8").split("\n");

    const updatedLines = [];
    let insideTargetArray = false;
    let indent = "";
    let updated = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!insideTargetArray) {
            const trimmed = line.trim();
            if (trimmed.startsWith(`${key}:`)) {
                insideTargetArray = true;
                updated = true;
                indent = line.match(/^(\s*)/)[0];
                updatedLines.push(`${indent}${key}:`);
                newArray.forEach(item => {
                    updatedLines.push(`${indent}  - "${item}"`);
                });

                let j = i + 1;
                while (j < lines.length && lines[j].trim().startsWith("-")) {
                    j++;
                }

                i = j - 1;
            } else {
                updatedLines.push(line);
            }
        } else {
            updatedLines.push(line);
        }
    }

    if (!updated) {
        if (updatedLines.length && updatedLines[updatedLines.length - 1] !== "") {
            updatedLines.push("");
        }
        updatedLines.push(`${key}:`);
        newArray.forEach(item => {
            updatedLines.push(`  - "${item}"`);
        });
    }

    fs.writeFileSync(configPath, updatedLines.join("\n"), "utf8");
}

function updateConfigValue(key, newValue) {
    const configPath = path.join(__dirname, "..", "config.yml");
    const lines = fs.readFileSync(configPath, "utf8").split("\n");

    const updatedLines = lines.map((line) => {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("#") || !trimmedLine.includes(":")) return line;

        const [k, ...rest] = trimmedLine.split(":");
        if (k.trim() === key) {
            const indent = line.match(/^(\s*)/)[0];
            const commentMatch = line.match(/(#.*)/);
            const comment = commentMatch ? " " + commentMatch[1] : "";
            return `${indent}${k.trim()}: ${newValue}${comment}`;
        }

        return line;
    });

    fs.writeFileSync(configPath, updatedLines.join("\n"), "utf8");
}

function reloadConfig() {
    try {
        const configPath = path.join(__dirname, "..", "config.yml");
        const fileContent = fs.readFileSync(configPath, "utf8");
        const config = YAML.parse(fileContent);

        global.config = config;
        global.users = {
            admin: Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [],
            support: Array.isArray(config.support_bot) ? config.support_bot.map(String) : [],
            owner: Array.isArray(config.owner_bot) ? config.owner_bot.map(String) : []
        };
        global.honorificMap = typeof config.honorific_map === 'object' && config.honorific_map !== null ?
            Object.fromEntries(Object.entries(config.honorific_map).map(([k, v]) => [String(k), String(v)])) : {};
    } catch (error) {
        logger.log(`Lỗi khi đọc config.yml: ${error.message || error}`, "error");
        process.exit(1);
    }
}
// MESSAGE CACHE
const messageCachePath = path.join(__dirname, "..", "data", "message_cache.json");

fs.mkdirSync(path.dirname(messageCachePath), { recursive: true });
if (!fs.existsSync(messageCachePath)) {
    fs.writeFileSync(messageCachePath, "{}", "utf-8");
}

function cleanOldMessages() {
    let messageCache = readMessageJson();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    Object.keys(messageCache).forEach((key) => {
        if (messageCache[key].timestamp < oneDayAgo) {
            delete messageCache[key];
        }
    });
    writeMessageJson(messageCache);
}

function readMessageJson() {
    try {
        const data = fs.readFileSync(messageCachePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        logger.log("Lỗi khi đọc file message.json: " + error.message, "error");
        return {};
    }
}

function writeMessageJson(data) {
    try {
        fs.writeFileSync(messageCachePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
        logger.log("Lỗi khi ghi file message.json: " + error.message, "error");
    }
}

function getMessageCache() {
    let messageCache = readMessageJson();
    return messageCache;
}

function updateMessageCache(data) {
    let messageCache = readMessageJson();
    try {
        const timestamp = new Date().toISOString();
        const filtered = {
            timestamp: data.data.ts,
            timestampString: timestamp,
            msgId: data.data.msgId,
            cliMsgId: data.data.cliMsgId,
            msgType: data.data.msgType,
            uidFrom: data.data.uidFrom,
            idTo: data.data.idTo,
            dName: data.data.dName,
            content: data.data.content,
            threadId: data.threadId,
            type: data.type
        };
        messageCache[data.data.cliMsgId] = filtered;
        writeMessageJson(messageCache);
    } catch (e) {
        logger.log("Lỗi khi update messageCache: " + e.message, "error");
    }
}

// PROCCES VIDEO
ffmpeg.setFfmpegPath(ffmpegStatic);

function convertDurationToFiveDigits(durationStr) {
  const duration = Number.parseFloat(durationStr);
  if (!Number.isFinite(duration)) {
    return '0';
  }
  const [sec, millisRaw] = duration.toFixed(3).split('.');
  return `${parseInt(sec, 10)}${millisRaw}`;
}

async function uploadFile(videoPath, ID, Type, apiInstance = null) {
    const targetApi = apiInstance || global.api;
    if (!targetApi || typeof targetApi.uploadAttachment !== "function") {
        throw new Error("Không tìm thấy API hợp lệ để upload tệp.");
    }

    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const result = await targetApi.uploadAttachment(
                videoPath,
                ID,
                Type
            );
            return result;
        } catch (err) {
            lastError = err;
            const msg = String(err?.message || err || "");
            const isFetchFailed = /fetch failed/i.test(msg);
            const isNetworkLike = isFetchFailed || /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network/i.test(msg);
            if (!isNetworkLike || attempt === maxAttempts) {
                throw err;
            }

            const delay = 400 * attempt;
            try {
                await new Promise((resolve) => setTimeout(resolve, delay));
            } catch {}
        }
    }

    throw lastError || new Error('Upload thất bại.');
}

async function extractThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on('end', () => {
        resolve(thumbnailPath);
      })
      .on('error', (err) => {
        console.error('Error generating thumbnail:', err.message);
        reject(err);
      })
      .screenshots({
        count: 1,
        folder: path.dirname(thumbnailPath),
        filename: path.basename(thumbnailPath),
        timemarks: ['0']
      });
  });
}

async function processVideo(videoPath, threadId, type, apiInstance = null) {
  try {
    const videoInfo = await getVideoInfo(videoPath);
    const videoStream = Array.isArray(videoInfo?.streams)
      ? videoInfo.streams.find((s) => s.codec_type === 'video')
      : null;

    const durationValue = convertDurationToFiveDigits(videoInfo?.format?.duration);
    const metadata = {
      duration: durationValue,
      width: Number.isFinite(videoStream?.width) ? videoStream.width : undefined,
      height: Number.isFinite(videoStream?.height) ? videoStream.height : undefined,
    };

    const folderPath = path.dirname(videoPath);
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const thumbnailPath = path.join(folderPath, `${baseName}_thumb.jpg`);

    let thumbnailReady = false;
    // Some downloads might not contain a valid video stream -> skip thumbnail.
    if (videoStream) {
      try {
        await extractThumbnail(videoPath, thumbnailPath);
        thumbnailReady = fs.existsSync(thumbnailPath);
      } catch (thumbErr) {
        thumbnailReady = false;
      }
    }

    const videoUpload = await uploadFile(videoPath, threadId, type, apiInstance);
    const thumbnailUpload = thumbnailReady
      ? await uploadFile(thumbnailPath, threadId, type, apiInstance)
      : null;

    const videoUrl = Array.isArray(videoUpload) && videoUpload[0] ? videoUpload[0].fileUrl : null;
    const thumbnailUrl = Array.isArray(thumbnailUpload) && thumbnailUpload[0]
      ? (thumbnailUpload[0].normalUrl || thumbnailUpload[0].fileUrl)
      : null;

    if (!videoUrl) {
      throw new Error('Không thể lấy URL video sau khi upload.');
    }

    try {
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
    } catch (err) {
      console.warn('[processVideo] Không thể xoá thumbnail tạm:', err?.message || err);
    }

    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (err) {
      console.warn('[processVideo] Không thể xoá video tạm:', err?.message || err);
    }

    return {
      videoUrl,
      metadata,
      thumbnailUrl,
    };
  } catch (error) {
    console.error('Error processing video:', error.message);
    throw error;
  }
}

// PROCESS AUDIO
async function processAudio(audioPath, threadId, type, apiInstance = null) {
    const outputPath = audioPath.replace(/\.mp3$/, '.aac');
    await convertMp3ToAac(audioPath, outputPath)
    let uploadResult;
    try {
        uploadResult = await uploadFile(outputPath, threadId, type, apiInstance);
    } catch (err) {
        const msg = String(err?.message || err || 'Upload audio thất bại');
        throw new Error(`Upload audio thất bại: ${msg}`);
    }
    const fileUrl = Array.isArray(uploadResult) && uploadResult[0] ? uploadResult[0].fileUrl : null;
    if (!fileUrl) {
        throw new Error('Không thể lấy URL audio sau khi upload.');
    }
    const audioUrl = fileUrl + ".aac";

    fs.unlinkSync(audioPath);
    fs.unlinkSync(outputPath);

    return audioUrl;
}
    

function convertMp3ToAac(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .audioCodec('aac')
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

// QR CODE FUNCTIONS
async function decodeQRFromBase64(base64Image) {
    try {
        const buffer = Buffer.from(base64Image, 'base64');
        const jimpImage = await Jimp.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(jimpImage.bitmap.data),
            width: jimpImage.bitmap.width,
            height: jimpImage.bitmap.height
        };
        
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
            return code.data;
        } else {
            throw new Error("Không thể đọc QR code");
        }
    } catch (error) {
        throw error;
    }
}

function generateQRCodeInTerminal(data, options = {}) {
    const defaultOptions = {
        type: 'terminal',
        small: true,
        scale: 0.05,
        margin: 0,
        width: 1,
        errorCorrectionLevel: 'L'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    return new Promise((resolve, reject) => {
        QRCode.toString(data, finalOptions, (err, string) => {
            if (err) {
                reject(err);
            } else {
                resolve(string);
            }
        });
    });
}

async function displayQRCodeInConsole(base64Image, fallbackPath = null) {
    try {
        const qrData = await decodeQRFromBase64(base64Image);
        const qrString = await generateQRCodeInTerminal(qrData);
        console.log(qrString);
        if (fallbackPath) {
            try {
                saveBase64Image(base64Image, fallbackPath);
                logger.log(`Đã lưu QRCode tại: ${path.basename(fallbackPath)} (mở ảnh để xem nhỏ gọn hơn)`, "info");
            } catch (e) {
                logger.log(`Không thể lưu QRCode ra file: ${e.message || e}`, "warn");
            }
        }
        return true;
    } catch (error) {
        if (fallbackPath) {
            logger.log("Lỗi hiển thị QR code trong terminal, đang lưu vào file...", "warn");
            saveBase64Image(base64Image, fallbackPath);
            logger.log(`Vui lòng quét mã QRCode ${path.basename(fallbackPath)} để đăng nhập`, "info");
        }
        return false;
    }
}
module.exports = {
    updateConfigArray,
    updateConfigValue,
    reloadConfig,
    getJsonData,
    updateMessageCache,
    getMessageCache,
    cleanOldMessages,
    convertTimestamp,
    processVideo,
    processAudio,
    decodeQRFromBase64,
    generateQRCodeInTerminal,
    displayQRCodeInConsole,
    childRental,
    childCommandPolicy,
    getMotherBotAdmins,
    normalizeAdminList,
    pruneConfigAdmins,
    // SETTINGS (per-bot)
    readSettings: (uid) => {
        try {
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, '{}', 'utf8');
            const all = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const key = String(uid || 'default');
            return typeof all[key] === 'object' && all[key] !== null ? all[key] : {};
        } catch (e) { return {}; }
    },
    writeSettings: (uid, settingsObj) => {
        try {
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            const all = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
            const key = String(uid || 'default');
            all[key] = settingsObj || {};
            fs.writeFileSync(settingsPath, JSON.stringify(all, null, 2), 'utf8');
            return true;
        } catch (e) { return false; }
    },
    handleWelcomeOn: function(botUid, threadId) {
        try {
            const key = String(botUid || 'default');
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            const all = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
            const cur = typeof all[key] === 'object' && all[key] !== null ? all[key] : {};
            if (!cur.welcome) cur.welcome = {};
            cur.welcome[String(threadId)] = true;
            all[key] = cur;
            fs.writeFileSync(settingsPath, JSON.stringify(all, null, 2), 'utf8');
            return '🚦Chế độ welcome đã 🟢 Bật 🎉';
        } catch (e) {
            return '❌ Không thể bật welcome lúc này';
        }
    },
    handleWelcomeOff: function(botUid, threadId) {
        try {
            const key = String(botUid || 'default');
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            const all = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
            const cur = typeof all[key] === 'object' && all[key] !== null ? all[key] : {};
            if (cur.welcome && Object.prototype.hasOwnProperty.call(cur.welcome, String(threadId))) {
                cur.welcome[String(threadId)] = false;
                all[key] = cur;
                fs.writeFileSync(settingsPath, JSON.stringify(all, null, 2), 'utf8');
                return '🚦Chế độ welcome đã 🔴 Tắt 🎉';
            }
            return '🚦Nhóm chưa có thông tin cấu hình welcome để 🔴 Tắt 🤗';
        } catch (e) {
            return '❌ Không thể tắt welcome lúc này';
        }
    },
    getAllowWelcome: function(botUid, threadId) {
        try {
            const key = String(botUid || 'default');
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            if (!fs.existsSync(settingsPath)) return false;
            const all = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const cur = typeof all[key] === 'object' && all[key] !== null ? all[key] : {};
            return !!(cur.welcome && cur.welcome[String(threadId)] === true);
        } catch (e) { return false; }
    },
    // helpers for owner addressing
    isOwner: (id) => {
        try {
            const s = String(id);
            const list = global.users?.owner || (Array.isArray(global.config?.owner_bot) ? global.config.owner_bot.map(String) : []);
            return Array.isArray(list) && list.includes(s);
        } catch { return false; }
    },
    honorificFor: (id) => {
        try {
            const s = String(id);
            if (global.honorificMap && global.honorificMap[s]) return global.honorificMap[s];
            return (module.exports.isOwner && module.exports.isOwner(s)) ? 'chủ nhân' : 'bạn';
        } catch { return 'bạn'; }
    }
};