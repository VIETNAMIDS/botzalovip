const fs = require('fs');
const path = require('path');
const axios = require('axios');

const des = {
    version: "2.5.0",
    credits: "Bé Bii",
    description: "Gửi tài khoản game Liên Quân, có thể set danh sách và ảnh minh họa."
};

// ===== DANH SÁCH ADMIN =====
const ADMIN = [
    "764450365581940909",  // ID admin chính (bonz)
];

const ACCOUNT_FILE = "modules/data/lienquan.txt";
const IMAGE_FILE = "modules/data/lienquan/lienquan.jpg";
const DATA_FILE = "modules/data/lienquan/lienquan_data.json";

// ===== Kiểm tra quyền =====
function isAdmin(authorId) {
    return ADMIN.includes(String(authorId));
}

// ===== Tạo thư mục nếu chưa có =====
function ensureDirs() {
    const accountDir = path.dirname(ACCOUNT_FILE);
    const imageDir = path.dirname(IMAGE_FILE);
    
    if (!fs.existsSync(accountDir)) {
        fs.mkdirSync(accountDir, { recursive: true });
    }
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }
}

// ===== Tải ảnh từ URL =====
async function downloadImage(url, savePath) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 10000
        });
        
        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(true));
            writer.on('error', reject);
        });
    } catch (error) {
        console.log(`Lỗi tải ảnh: ${error.message}`);
        return false;
    }
}

// ===== Đọc file tài khoản =====
function readAccounts() {
    if (!fs.existsSync(ACCOUNT_FILE)) {
        return [];
    }
    try {
        const content = fs.readFileSync(ACCOUNT_FILE, 'utf8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    } catch (error) {
        console.log(`Lỗi đọc file tài khoản: ${error.message}`);
        return [];
    }
}

// ===== Ghi file tài khoản =====
function writeAccounts(content) {
    ensureDirs();
    try {
        fs.writeFileSync(ACCOUNT_FILE, content.trim(), 'utf8');
        return true;
    } catch (error) {
        console.log(`Lỗi ghi file tài khoản: ${error.message}`);
        return false;
    }
}

// ===== Đọc/lưu dữ liệu hình ảnh =====
function loadData() {
    ensureDirs();
    const defaultData = { image_path: IMAGE_FILE };
    
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.image_path) {
                data.image_path = IMAGE_FILE;
            }
            return data;
        } catch (error) {
            console.log(`Lỗi đọc data file: ${error.message}`);
        }
    }
    return defaultData;
}

function saveData(data) {
    ensureDirs();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (error) {
        console.log(`Lỗi lưu data file: ${error.message}`);
        return false;
    }
}

// ===== Gửi phản hồi với style =====
function replyStyled(api, text, event) {
    return api.sendMessage({
        body: text,
        mentions: []
    }, event.threadID, event.messageID);
}

// ===== Lấy ngẫu nhiên từ mảng =====
function getRandomItems(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// ===== Lệnh chính =====
async function handleLienquanCommand(api, event, args) {
    const sub = args[0] ? args[0].toLowerCase() : null;
    const accounts = readAccounts();
    const data = loadData();

    // --- Lệnh set danh sách ---
    if (sub === "set") {
        if (!isAdmin(event.senderID)) {
            return replyStyled(api, "🚫 Bạn không có quyền cập nhật danh sách tài khoản Liên Quân.", event);
        }
        
        if (!event.messageReply || !event.messageReply.body) {
            return replyStyled(api, "⚠️ Hãy reply vào tin nhắn chứa danh sách tài khoản mới để cập nhật.", event);
        }
        
        if (writeAccounts(event.messageReply.body)) {
            return replyStyled(api, "✅ Đã cập nhật danh sách tài khoản Liên Quân thành công!", event);
        } else {
            return replyStyled(api, "❌ Lỗi khi ghi file tài khoản.", event);
        }
    }

    // --- Lệnh set ảnh ---
    if (sub === "setimg") {
        if (!isAdmin(event.senderID)) {
            return replyStyled(api, "🚫 Bạn không có quyền thay ảnh minh họa Liên Quân.", event);
        }
        
        if (!event.messageReply || !event.messageReply.attachments || event.messageReply.attachments.length === 0) {
            return replyStyled(api, "⚠️ Hãy reply vào ảnh bạn muốn đặt làm ảnh minh họa.", event);
        }
        
        const attachment = event.messageReply.attachments[0];
        if (attachment.type !== "photo") {
            return replyStyled(api, "❌ Vui lòng reply vào một ảnh hợp lệ.", event);
        }
        
        const imageUrl = attachment.url;
        const success = await downloadImage(imageUrl, IMAGE_FILE);
        
        if (success) {
            data.image_path = IMAGE_FILE;
            saveData(data);
            return replyStyled(api, "✅ Ảnh minh họa Liên Quân đã được cập nhật thành công!", event);
        } else {
            return replyStyled(api, "❌ Lỗi khi tải ảnh. Vui lòng thử lại.", event);
        }
    }

    // --- Gửi tài khoản ngẫu nhiên + ảnh ---
    if (sub === null || /^\d+$/.test(sub)) {
        if (accounts.length === 0) {
            return replyStyled(api, "⚠️ File `modules/data/lienquan.txt` hiện chưa có tài khoản nào.", event);
        }

        let count = 1;
        if (sub && /^\d+$/.test(sub)) {
            count = parseInt(sub);
        }
        
        count = Math.min(count, accounts.length);
        const selected = getRandomItems(accounts, count);
        
        let msg = "🎮 𝐓𝐚̀𝐢 𝐊𝐡𝐨𝐚̉𝐧 𝐋𝐢𝐞̂𝐧 𝐐𝐮𝐚̂𝐧 𝐜𝐮̉𝐚 𝐛𝐚̣𝐧:\n───────────────────\n";
        msg += selected.join('\n');
        msg += `\n───────────────────\n📦 Tổng: ${count}/${accounts.length} tài khoản có sẵn.`;

        const imagePath = data.image_path || IMAGE_FILE;
        
        // Gửi tin nhắn với ảnh nếu có
        if (fs.existsSync(imagePath)) {
            api.sendMessage({
                body: msg,
                attachment: fs.createReadStream(imagePath)
            }, event.threadID, (err, info) => {
                if (!err) {
                    // Gửi reaction ngẫu nhiên
                    const icons = ["🎮", "🔥", "⚡", "💥", "🏆", "🚀", "💫", "🕹️"];
                    const randomIcons = getRandomItems(icons, Math.min(6, icons.length));
                    
                    randomIcons.forEach((icon, index) => {
                        setTimeout(() => {
                            api.setMessageReaction(icon, info.messageID, (err) => {
                                if (err) console.log(`Lỗi reaction: ${err}`);
                            }, true);
                        }, index * 500);
                    });
                }
            });
        } else {
            api.sendMessage(msg, event.threadID, event.messageID, (err, info) => {
                if (!err) {
                    // Gửi reaction ngẫu nhiên
                    const icons = ["🎮", "🔥", "⚡", "💥", "🏆", "🚀", "💫", "🕹️"];
                    const randomIcons = getRandomItems(icons, Math.min(6, icons.length));
                    
                    randomIcons.forEach((icon, index) => {
                        setTimeout(() => {
                            api.setMessageReaction(icon, info.messageID, (err) => {
                                if (err) console.log(`Lỗi reaction: ${err}`);
                            }, true);
                        }, index * 500);
                    });
                }
            });
        }
        return;
    }

    // --- Sai cú pháp ---
    return replyStyled(api, 
        "⚠️ Sai cú pháp.\n" +
        "• lienquan → nhận 1 tài khoản ngẫu nhiên\n" +
        "• lienquan <số lượng> → nhận nhiều tài khoản\n" +
        "• lienquan set → reply danh sách để cập nhật file\n" +
        "• lienquan setimg → reply ảnh để đổi ảnh minh họa", 
        event
    );
}

// ===== Export module =====
module.exports = {
    config: {
        name: "lienquan",
        version: "2.5.0",
        hasPermssion: 0,
        credits: "Bé Bii",
        description: "Gửi tài khoản game Liên Quân, có thể set danh sách và ảnh minh họa.",
        commandCategory: "Game",
        usages: "[số lượng] | set | setimg",
        cooldowns: 3
    },
    
    run: async function({ api, event, args }) {
        return handleLienquanCommand(api, event, args);
    }
};
