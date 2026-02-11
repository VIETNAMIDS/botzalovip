module.exports.config = {
    event_type: ["group_event"],
    name: "leaveNoti",
    version: "1.0.0",
    author: "Bonz + GPT",
    description: "Leave/Kick notification với Canvas API - giống joinNoti"
};

// Constants
const linkBackgroundDefault = "https://f58-zpg-r.zdn.vn/jpg/5044485622965252364/799cd26798cc24927ddd.jpg";
const linkBackgroundDefaultZalo = "https://cover-talk.zadn.vn/default";

// Helper function to get background
async function getLinkBackgroundDefault(userInfo, loadImage) {
    let backgroundImage;
    try {
        if (userInfo.cover && userInfo.cover !== linkBackgroundDefaultZalo) {
            backgroundImage = await loadImage(userInfo.cover);
        } else {
            backgroundImage = await loadImage(linkBackgroundDefault);
        }
    } catch (error) {
        backgroundImage = await loadImage(linkBackgroundDefault);
    }
    return backgroundImage;
}

// Helper function to validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Main image creation function
async function createImage(userInfo, message, fileName, createCanvas, loadImage, fs, path, tempPath) {
    const width = 1000;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    let backgroundImage;
    let typeImage = -1;
    let fluent = 0.8;
    if (fileName.includes("goodbye")) {
        typeImage = 1;
        fluent = 0.6;
    } else if (["blocked", "kicked", "kicked_spam"].some(keyword => fileName.includes(keyword))) {
        typeImage = 2;
        fluent = 0.85;
    }

    try {
        backgroundImage = await getLinkBackgroundDefault(userInfo, loadImage);
        ctx.drawImage(backgroundImage, 0, 0, width, height);

        const overlay = ctx.createLinearGradient(0, 0, 0, height);
        overlay.addColorStop(0, `rgba(30, 30, 53, ${fluent})`);
        overlay.addColorStop(0.5, `rgba(26, 37, 71, ${fluent})`);
        overlay.addColorStop(1, `rgba(19, 27, 54, ${fluent})`);

        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);
    } catch (error) {
        console.error("Lỗi khi xử lý background:", error);
        const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
        backgroundGradient.addColorStop(0, "#1E1E35");
        backgroundGradient.addColorStop(0.5, "#1A2547");
        backgroundGradient.addColorStop(1, "#131B36");

        ctx.fillStyle = backgroundGradient;
        ctx.fillRect(0, 0, width, height);
    }

    let xAvatar = 118;
    let widthAvatar = 162;
    let heightAvatar = 162;
    let yAvatar = height / 2 - heightAvatar / 2;

    let gradientColors;
    if (typeImage === 1) { // Goodbye
        gradientColors = [
            "#FFFFFF", "#F0F0F0", "#FAFAFF", "#F8FBFF", "#EAEAFF", "#FFF5FA", "#FFFFFF"
        ];
    } else if (typeImage === 2) { // Blocked/Kicked
        gradientColors = [
            "#ff0000", "#ff1111", "#ff2200", "#ff0022", "#ff3300"
        ];
    } else {
        gradientColors = [
            "#FF1493", "#FF69B4", "#FFD700", "#FFA500", "#FF8C00", "#00FF7F", "#40E0D0"
        ];
    }
    const shuffledColors = [...gradientColors].sort(() => Math.random() - 0.5);

    const userAvatarUrl = userInfo.avatar;
    if (userAvatarUrl && isValidUrl(userAvatarUrl)) {
        try {
            const avatar = await loadImage(userAvatarUrl);

            const borderWidth = 6;
            const gradient = ctx.createLinearGradient(
                xAvatar - widthAvatar / 2 - borderWidth,
                yAvatar - borderWidth,
                xAvatar + widthAvatar / 2 + borderWidth,
                yAvatar + heightAvatar + borderWidth
            );

            shuffledColors.forEach((color, index) => {
                gradient.addColorStop(index / (shuffledColors.length - 1), color);
            });

            ctx.save();
            ctx.beginPath();
            ctx.arc(xAvatar, height / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Vẽ avatar
            ctx.beginPath();
            ctx.arc(xAvatar, height / 2, widthAvatar / 2, 0, Math.PI * 2, true);
            ctx.clip();
            ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
            ctx.restore();

            // Vẽ đường thẳng màu trắng bên phải avatar
            ctx.beginPath();
            ctx.moveTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + 30);
            ctx.lineTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + heightAvatar - 30);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.stroke();
        } catch (error) {
            console.error("Lỗi load avatar:", error);
        }
    }

    let x1 = xAvatar - widthAvatar / 2 + widthAvatar;
    let x2 = x1 + (width - x1) / 2 - 5;
    let y1 = 86;

    // Tạo gradient cho title
    const titleGradient = ctx.createLinearGradient(x2 - 150, y1 - 30, x2 + 150, y1);
    shuffledColors.slice(0, 3).forEach((color, index) => {
        titleGradient.addColorStop(index / 2, color);
    });
    ctx.fillStyle = titleGradient;
    ctx.textAlign = "center";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.fillText(message.title, x2, y1);

    // Gradient cho userName
    let y2 = y1 + 50;
    const userNameGradient = ctx.createLinearGradient(x2 - 150, y2 - 30, x2 + 150, y2);
    shuffledColors.slice(2, 5).forEach((color, index) => {
        userNameGradient.addColorStop(index / 2, color);
    });
    ctx.fillStyle = userNameGradient;
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.fillText(message.userName, x2, y2);

    // Gradient cho subtitle
    let y3 = y2 + 45;
    const subtitleGradient = ctx.createLinearGradient(x2 - 150, y3 - 30, x2 + 150, y3);
    shuffledColors.slice(1, 4).forEach((color, index) => {
        subtitleGradient.addColorStop(index / 2, color);
    });
    ctx.fillStyle = subtitleGradient;
    ctx.font = "32px Arial, sans-serif";
    ctx.fillText(message.subtitle, x2, y3);

    // Gradient cho author
    let y4 = y3 + 45;
    const authorGradient = ctx.createLinearGradient(x2 - 150, y4 - 30, x2 + 150, y4);
    shuffledColors.slice(3, 6).forEach((color, index) => {
        authorGradient.addColorStop(index / 2, color);
    });
    ctx.fillStyle = authorGradient;
    ctx.font = "bold 32px Arial, sans-serif";
    ctx.fillText(message.author, x2, y4);

    const filePath = path.join(tempPath, fileName);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(filePath, buffer);
    return filePath;
}

// Goodbye image creation function
async function createGoodbyeImage(userInfo, groupName, groupType, userActionName, isAdmin, createCanvas, loadImage, fs, path, tempPath) {
    const userName = userInfo.name || "";
    return createImage(
        userInfo,
        {
            title: `${groupName}`,
            userName: `Tạm biệt ${isAdmin ? "Đại Ca " : ""}${userName}`,
            subtitle: `Đã Rời Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
            author: `Chúc Bạn Mọi Điều Tốt Lành`,
        },
        `goodbye_${Date.now()}.png`,
        createCanvas, loadImage, fs, path, tempPath
    );
}

// Kick image creation function  
async function createKickImage(userInfo, groupName, groupType, userActionName, isAdmin, createCanvas, loadImage, fs, path, tempPath) {
    const userName = userInfo.name || "";
    return createImage(
        userInfo,
        {
            title: `${groupName}`,
            userName: `${isAdmin ? "Đại Ca " : ""}${userName}`,
            subtitle: `Đã Bị Kick Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
            author: `Bởi ${userActionName}`,
        },
        `kicked_${Date.now()}.png`,
        createCanvas, loadImage, fs, path, tempPath
    );
}

module.exports.run = async function({ api, event }) {
    const { ThreadType, GroupEventType } = require("zca-js");
    const { createCanvas, loadImage } = require("canvas");
    const fs = require("fs").promises;
    const path = require("path");
    const utils = require("../../utils");
    
    const tempPath = path.join(__dirname, 'temp');
    try { await fs.mkdir(tempPath, { recursive: true }); } catch (e) { console.error("Không thể tạo thư mục temp:", e); }

    // Chỉ xử lý LEAVE và KICK events
    if (event.type !== GroupEventType.LEAVE && event.type !== GroupEventType.KICK) return;

    const { threadId, data } = event;
    
    // Kiểm tra cờ welcome (dùng chung setting)
    try {
        const botUid = api.getOwnId();
        if (!utils.getAllowWelcome(botUid, threadId)) return;
    } catch (_) {}
    
    if (!data || !data.updateMembers || data.updateMembers.length === 0) return;

    const authorId = data.sourceId;
    const updateMembers = data.updateMembers;
    if (updateMembers.map(m => m.id).includes(api.getOwnId())) return;
    
    const tempFilePaths = [];

    try {
        const groupInfo = await api.getGroupInfo(threadId);
        const details = groupInfo.gridInfoMap[threadId];
        const totalMember = details?.totalMember || 0;

        const authorInfo = await api.getUserInfo(authorId);
        const groupName = details?.name || "nhóm này";
        const authorName = authorInfo.changed_profiles[authorId]?.displayName || "Hệ thống";
        
        // Xử lý LEAVE event
        if (event.type === GroupEventType.LEAVE) {
            console.log('[LeaveNoti] Processing LEAVE event');
            
            const leftMember = updateMembers[0];
            const userInfo = {
                name: leftMember.dName,
                avatar: leftMember.avatar,
                cover: null
            };

            // Tạo ảnh goodbye
            const goodbyeImagePath = await createGoodbyeImage(
                userInfo,
                groupName,
                details?.threadType || 1,
                authorName,
                false,
                createCanvas, loadImage, fs, path, tempPath
            );

            const goodbyeMsg = `😢 ${leftMember.dName} đã rời khỏi nhóm.\n👥 Còn lại ${totalMember} thành viên.\n💔 Chúc bạn mọi điều tốt lành!`;
            
            const messagePayload = { 
                msg: goodbyeMsg, 
                ttl: 60 * 60 * 1000 
            };

            if (goodbyeImagePath) {
                messagePayload.attachments = [goodbyeImagePath];
                tempFilePaths.push(goodbyeImagePath);
            }

            await api.sendMessage(messagePayload, threadId, ThreadType.Group);
        }
        
        // Xử lý KICK event
        else if (event.type === GroupEventType.KICK) {
            console.log('[LeaveNoti] Processing KICK event');
            
            const kickedMember = updateMembers[0];
            const userInfo = {
                name: kickedMember.dName,
                avatar: kickedMember.avatar,
                cover: null
            };

            // Tạo ảnh kick
            const kickImagePath = await createKickImage(
                userInfo,
                groupName,
                details?.threadType || 1,
                authorName,
                false,
                createCanvas, loadImage, fs, path, tempPath
            );

            const kickMsg = `⚡ ${kickedMember.dName} đã bị ${authorName} kick khỏi nhóm.\n👥 Còn lại ${totalMember} thành viên.\n🚫 Vi phạm quy định nhóm.`;
            
            const messagePayload = { 
                msg: kickMsg, 
                ttl: 60 * 60 * 1000 
            };

            if (kickImagePath) {
                messagePayload.attachments = [kickImagePath];
                tempFilePaths.push(kickImagePath);
            }

            await api.sendMessage(messagePayload, threadId, ThreadType.Group);
        }

    } catch (error) {
        console.error("Lỗi trong leave/kick event handler:", error);
        
        // Fallback message
        let fallbackMsg = "";
        if (event.type === GroupEventType.LEAVE) {
            fallbackMsg = "😢 Có thành viên đã rời khỏi nhóm.";
        } else if (event.type === GroupEventType.KICK) {
            fallbackMsg = "⚡ Có thành viên đã bị kick khỏi nhóm.";
        }
        
        if (fallbackMsg) {
            await api.sendMessage(fallbackMsg, threadId, ThreadType.Group).catch(() => {});
        }
    } finally {
        // Cleanup temp files
        for (const filePath of tempFilePaths) {
            try { 
                await fs.unlink(filePath); 
                console.log('[LeaveNoti] Cleaned up:', path.basename(filePath));
            } catch (_) {}
        }
    }
};