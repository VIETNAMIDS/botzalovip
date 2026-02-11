module.exports.config = {
  name: "lienquan",
  aliases: ["lq", "aov", "lienquanmobile"],
  version: "2.5.0",
  role: 0,
  author: "Bé Bii",
  description: "Gửi tài khoản game Liên Quân Mobile ngẫu nhiên với ảnh minh họa",
  category: "Game",
  usage: "lienquan [số lượng] | lienquan set | lienquan setimg",
  cooldowns: 3
};

const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

// ===== Lấy ngẫu nhiên từ mảng =====
function getRandomItems(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

module.exports.run = async ({ api, event, args }) => {
    const { threadId, type, data } = event;
    const senderId = String(data?.uidFrom || event?.authorId || '');
    
    try {
        // Kiểm tra chế độ silent mode
        const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
        if (interactionMode === 'silent') {
            return;
        }

        const sub = args[0] ? args[0].toLowerCase() : null;
        const accounts = readAccounts();
        const dataConfig = loadData();

        // --- Lệnh set danh sách ---
        if (sub === "set") {
            if (!isAdmin(senderId)) {
                return api.sendMessage("🚫 Bạn không có quyền cập nhật danh sách tài khoản Liên Quân.", threadId, type);
            }
            
            if (!event.messageReply || !event.messageReply.body) {
                return api.sendMessage("⚠️ Hãy reply vào tin nhắn chứa danh sách tài khoản mới để cập nhật.", threadId, type);
            }
            
            if (writeAccounts(event.messageReply.body)) {
                return api.sendMessage("✅ Đã cập nhật danh sách tài khoản Liên Quân thành công!", threadId, type);
            } else {
                return api.sendMessage("❌ Lỗi khi ghi file tài khoản.", threadId, type);
            }
        }

        // --- Lệnh set ảnh ---
        if (sub === "setimg") {
            if (!isAdmin(senderId)) {
                return api.sendMessage("🚫 Bạn không có quyền thay ảnh minh họa Liên Quân.", threadId, type);
            }
            
            if (!event.messageReply || !event.messageReply.attachments || event.messageReply.attachments.length === 0) {
                return api.sendMessage("⚠️ Hãy reply vào ảnh bạn muốn đặt làm ảnh minh họa.", threadId, type);
            }
            
            const attachment = event.messageReply.attachments[0];
            if (attachment.type !== "photo") {
                return api.sendMessage("❌ Vui lòng reply vào một ảnh hợp lệ.", threadId, type);
            }
            
            const imageUrl = attachment.url;
            const success = await downloadImage(imageUrl, IMAGE_FILE);
            
            if (success) {
                dataConfig.image_path = IMAGE_FILE;
                saveData(dataConfig);
                return api.sendMessage("✅ Ảnh minh họa Liên Quân đã được cập nhật thành công!", threadId, type);
            } else {
                return api.sendMessage("❌ Lỗi khi tải ảnh. Vui lòng thử lại.", threadId, type);
            }
        }

        // --- Gửi tài khoản ngẫu nhiên + ảnh ---
        if (sub === null || /^\d+$/.test(sub)) {
            if (accounts.length === 0) {
                return api.sendMessage("⚠️ File `modules/data/lienquan.txt` hiện chưa có tài khoản nào.", threadId, type);
            }

            let count = 1;
            if (sub && /^\d+$/.test(sub)) {
                count = parseInt(sub);
            }
            
            count = Math.min(count, accounts.length, 10); // Giới hạn tối đa 10
            const selected = getRandomItems(accounts, count);
            
            if (selected.length === 0) {
                return api.sendMessage("❌ Không thể lấy tài khoản. Vui lòng thử lại.", threadId, type);
            }
            
            let msg = "🎮 𝐓𝐚̀𝐢 𝐊𝐡𝐨𝐚̉𝐧 𝐋𝐢𝐞̂𝐧 𝐐𝐮𝐚̂𝐧 𝐜𝐮̉𝐚 𝐛𝐚̣𝐧:\n───────────────────\n";
            msg += selected.join('\n');
            msg += `\n───────────────────\n📦 Tổng: ${count}/${accounts.length} tài khoản có sẵn.`;

            // Đảm bảo tin nhắn không rỗng
            if (!msg || msg.trim().length === 0) {
                return api.sendMessage("❌ Lỗi tạo tin nhắn. Vui lòng thử lại.", threadId, type);
            }

            const imagePath = dataConfig.image_path || IMAGE_FILE;
            
            // Gửi tin nhắn (không gửi ảnh để tránh lỗi)
            return api.sendMessage(msg, threadId, type).then((info) => {
                // Gửi reaction sau khi gửi tin nhắn thành công
                if (info && info.messageID) {
                    const icons = ["🎮", "🔥", "⚡", "💥", "🏆", "🚀"];
                    const randomIcons = getRandomItems(icons, 3);
                    
                    randomIcons.forEach((icon, index) => {
                        setTimeout(() => {
                            try {
                                api.setMessageReaction(icon, info.messageID, () => {}, true);
                            } catch (e) {
                                console.log(`Lỗi reaction: ${e.message}`);
                            }
                        }, (index + 1) * 1000);
                    });
                }
            }).catch((error) => {
                console.log("Lỗi gửi tin nhắn:", error.message);
                return api.sendMessage("❌ Có lỗi xảy ra khi gửi tài khoản.", threadId, type);
            });
        }

        // --- Sai cú pháp ---
        return api.sendMessage(
            "⚠️ Sai cú pháp.\n" +
            "• lienquan → nhận 1 tài khoản ngẫu nhiên\n" +
            "• lienquan <số lượng> → nhận nhiều tài khoản\n" +
            "• lienquan set → reply danh sách để cập nhật file\n" +
            "• lienquan setimg → reply ảnh để đổi ảnh minh họa", 
            threadId, type
        );

    } catch (error) {
        console.error("Error in lienquan command:", error);
        return api.sendMessage("❌ Có lỗi xảy ra khi thực hiện lệnh!", threadId, type);
    }
};
