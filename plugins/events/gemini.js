const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');

module.exports.config = {
    event_type: ["message"],
    name: "gemini",
    version: "1.0.0",
    author: "tuân",
    description: "Trò chuyện với AI",
    dependencies: {}
};

// Nạp API keys từ config.yml (global.config.gemini_api_keys) hoặc biến môi trường GEMINI_API_KEYS (phân tách bằng dấu phẩy)
function getGeminiKeys() {
    try {
        const keysFromConfig = Array.isArray(global?.config?.gemini_api_keys)
            ? global.config.gemini_api_keys
            : [];
        const keysFromEnv = (process.env.GEMINI_API_KEYS || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const merged = [...keysFromConfig, ...keysFromEnv]
            .map(String)
            .map(k => k.trim())
            .filter(Boolean);
        return merged.length ? Array.from(new Set(merged)) : [""];
    } catch {
        return [""];
    }
}

const GEMINI_API_KEYS = getGeminiKeys();
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}";


// Chỉ hỗ trợ tiền tố 'gemini'
const COMMANDS = ["gemini"]; // bỏ alias /gpt, gpt

function matchCommand(text) {
    if (typeof text !== "string") return null;
    const lower = text.trim().toLowerCase();
    for (const cmd of COMMANDS) {
        if (lower.startsWith(cmd)) {
            // Cắt đúng theo độ dài tiền tố đã khớp (không hardcode slice)
            const rest = text.trim().slice(cmd.length).trim();
            return { cmd, rest };
        }
    }
    return null;
}

async function getGeminiResponse(prompt) {
    const headers = { "Content-Type": "application/json" };
    const data = { contents: [{ parts: [{ text: prompt }] }] };
    for (const key of GEMINI_API_KEYS) {
        const url = GEMINI_API_URL.replace("{}", key);
        try {
            const response = await axios.post(url, data, { headers });
            const result = response.data;
            if (response.status === 200 && !result.error) {
                return result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }
            if (result.error && [429, 503].includes(result.error.code)) continue;
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error && [429, 503].includes(err.response.data.error.code)) continue;
        }
    }
    return "xin lỗi nay tôi đã trò chuyện với người dùng quá nhiều - hẹn các bạn vào hôm sau.";
}

async function getGeminiImageResponse(imagePath, prompt = "Mô tả ảnh này") {
    const imgBuffer = await fs.readFile(imagePath);
    const imgBase64 = imgBuffer.toString("base64");
    const headers = { "Content-Type": "application/json" };
    const data = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: imgBase64,
                        }
                    }
                ]
            }
        ]
    };
    for (const key of GEMINI_API_KEYS) {
        const url = GEMINI_API_URL.replace("{}", key);
        try {
            const response = await axios.post(url, data, { headers });
            return response.data;
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error && [429, 503].includes(err.response.data.error.code)) continue;
        }
    }
    return { error: "Không thể xử lý ảnh với Gemini API." };
}

async function getGeminiImageResponsePro(imagePath, prompt = "Mô tả ảnh này") {
    const imgBuffer = await fs.readFile(imagePath);
    const imgBase64 = imgBuffer.toString("base64");
    const headers = { "Content-Type": "application/json" };
    const data = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: imgBase64,
                        }
                    }
                ]
            }
        ]
    };
    for (const key of GEMINI_API_KEYS) {
        const url = GEMINI_API_URL_PRO.replace("{}", key);
        try {
            const response = await axios.post(url, data, { headers });
            return response.data;
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error && [429, 503].includes(err.response.data.error.code)) continue;
        }
    }
    return { error: "Không thể xử lý ảnh với Gemini API." };
}

module.exports.run = async function ({ api, event }) {
    const { threadId, data, type } = event;
    const linkimg = data.content?.href || data.content?.thumb;

    // Xử lý text
    if (typeof data.content === "string") {
        const m = matchCommand(data.content);
        if (m) {
            let content_noimg = (m.rest || "") + " trả lời cho tôi ngắn gọn nhất và luôn đảm bảo câu trả lời dưới 340 chữ";
            content_noimg = content_noimg.slice(0, 340);
            const result = await getGeminiResponse(content_noimg);
            if (threadId && type && typeof result === "string" && result.length > 0) {
                try {
                    await api.sendMessage(result, threadId, type);
                } catch (error) {
                    if (error.code === 161) {
                        console.error("❌ Nhóm này không tồn tại hoặc bot không có quyền truy cập.");
                    } else {
                        console.error("❌ Lỗi gửi tin nhắn:", error.message);
                    }
                }
            } else {
                await api.sendMessage("❌ Lỗi tham số gửi tin nhắn.", threadId, type);
            }
            return; // đã xử lý text command
        }
    }
    // Xử lý ảnh
    else if (typeof data.content?.title === "string" && matchCommand(data.content.title)) {
        const tempPath = path.join(__dirname, 'temp');
        await fs.mkdir(tempPath, { recursive: true });
        const imagePath = path.join(__dirname, 'temp', `image_${threadId}.jpg`);
        const mimg = matchCommand(data.content.title);
        let content_haveimg = ((mimg?.rest) || "") + " trả lời cho tôi ngắn gọn nhất và luôn đảm bảo câu trả lời dưới 340 chữ";
        content_haveimg = content_haveimg.slice(0, 340);
        try {
            const response = await axios.get(linkimg, { responseType: 'arraybuffer' });
            await fs.writeFile(imagePath, response.data);
            const result = await getGeminiImageResponse(imagePath, content_haveimg);
            const text = String(result?.candidates?.[0]?.content?.parts?.[0]?.text || "Không có mô tả");
            if (threadId && type && typeof text === "string" && text.length > 0) {
                try {
                    await api.sendMessage(text, threadId, type);
                } catch (error) {
                    if (error.code === 161) {
                        console.error("❌ Nhóm này không tồn tại hoặc bot không có quyền truy cập.");
                    } else {
                        console.error("❌ Lỗi gửi tin nhắn:", error.message);
                    }
                }
            } else {
                await api.sendMessage("❌ Lỗi tham số gửi tin nhắn.", threadId, type);
            }
            // Xóa file ảnh sau khi xử lý
            await fs.unlink(imagePath).catch(() => {});
        } catch (error) {
            console.error("Lỗi xử lý ảnh:", error.message);
            await api.sendMessage("❌ Không thể xử lý ảnh.", threadId, type);
        }
    }
    // Xử lý text pro
    
    // Xử lý ảnh pro
};