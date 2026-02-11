module.exports.config = {
    event_type: ["group_event"],
    name: "joinNoti",
    version: "2.0.0",
    author: "Bonz + GPT",
    description: "Welcome system với Canvas API"
};

module.exports.run = async function({ api, event }) {
    const { ThreadType, GroupEventType } = require("zca-js");
    const { createCanvas, loadImage } = require("canvas");
    const fs = require("fs").promises;
    const path = require("path");
    const utils = require("../../utils");
    
    const tempPath = path.join(__dirname, 'temp');
    try { await fs.mkdir(tempPath, { recursive: true }); } catch (e) { console.error("Không thể tạo thư mục temp:", e); }

    if (event.type !== GroupEventType.JOIN) return;

    const { threadId, data } = event;
    
    // Kiểm tra cờ welcome
    try {
        const botUid = api.getOwnId();
        if (!utils.getAllowWelcome(botUid, threadId)) return;
    } catch (_) {}
    
    if (!data || !data.updateMembers || data.updateMembers.length === 0) return;

    const authorId = data.sourceId;
    const newMembers = data.updateMembers;
    if (newMembers.map(m => m.id).includes(api.getOwnId())) return;
    
    const tempFilePaths = [];

    try {
        const groupInfo = await api.getGroupInfo(threadId);
        const details = groupInfo.gridInfoMap[threadId];
        const totalMember = details?.totalMember || newMembers.length;

        const authorInfo = await api.getUserInfo(authorId);
        const groupName = details?.name || "nhóm này";
        const authorName = authorInfo.changed_profiles[authorId]?.displayName || "Link mời";
        
        // Tạo mentions cho text message
        const mentions = [];
        const msgParts = [];
        let currentLength = 0;

        const part1 = "🎉 Chào mừng ";
        msgParts.push(part1);
        currentLength += part1.length;

        newMembers.forEach((member, index) => {
            const nameTag = `@${member.dName}`;
            mentions.push({ pos: currentLength, len: nameTag.length, uid: member.id });
            msgParts.push(nameTag);
            currentLength += nameTag.length;
            if (index < newMembers.length - 1) {
                const separator = ", ";
                msgParts.push(separator);
                currentLength += separator.length;
            }
        });

        let memberLine;
        if (newMembers.length > 1) {
            const startNum = totalMember - newMembers.length + 1;
            const memberNumbers = Array.from({ length: newMembers.length }, (_, i) => startNum + i);
            memberLine = `✨ Các bạn là thành viên thứ ${memberNumbers.join(', ')} của nhóm (tổng ${totalMember} thành viên).`;
        } else {
            memberLine = `✨ Bạn là thành viên thứ ${totalMember} của nhóm (tổng ${totalMember} thành viên).`;
        }

        const part3 = ` đến với ${groupName}!\n${memberLine}\n👤 Thêm bởi: `;
        msgParts.push(part3);
        currentLength += part3.length;

        const authorTag = `@${authorName}`;
        mentions.push({ pos: currentLength, len: authorTag.length, uid: authorId });
        msgParts.push(authorTag);

        const msg = msgParts.join("");
        const messagePayload = { msg, mentions, ttl: 60 * 60 * 1000 };

        // Tạo ảnh welcome với Canvas
        async function fetchUserCover(userId) {
            try {
                const info = await api.getUserInfo(userId);
                const profile = info?.changed_profiles?.[userId] || info?.unchanged_profiles?.[userId];
                const cover = profile?.cover || profile?.coverUrl || profile?.coverPhoto || profile?.backgroundUrl;
                if (!cover) return null;
                if (typeof cover === 'string') return cover;
                return cover?.url || cover?.photoUrl || null;
            } catch (error) {
                console.log('[JoinNoti] Không lấy được cover:', error?.message);
                return null;
            }
        }

        async function createWelcomeCanvas() {
            try {
                console.log('[JoinNoti Canvas] Creating welcome image...');
                
                const mainMember = newMembers[0];
                const userInfo = {
                    name: mainMember.dName,
                    avatar: mainMember.avatar,
                    cover: null
                };

                userInfo.cover = await fetchUserCover(mainMember.id);

                const welcomeImage = await createWelcomeImage(
                    userInfo,
                    groupName,
                    details?.threadType || 1,
                    authorName,
                    false,
                    newMembers.length > 1 ? newMembers.length : null
                );

                console.log('[JoinNoti Canvas] Welcome image created:', welcomeImage);
                return welcomeImage;

            } catch (error) {
                console.error('[JoinNoti Canvas] Error creating image:', error);
                return null;
            }
        }

        // Function tạo ảnh welcome
        async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin, memberCount = null) {
            const width = 1200;
            const height = 400;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext("2d");

            // Background URLs đẹp hơn
            const backgroundUrls = [
                "https://f58-zpg-r.zdn.vn/jpg/5044485622965252364/799cd26798cc24927ddd.jpg",
                "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=400&fit=crop",
                "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=400&fit=crop",
                "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1200&h=400&fit=crop"
            ];
            
            let backgroundImage;
            try {
                if (userInfo.cover) {
                    backgroundImage = await loadImage(userInfo.cover);
                } else {
                    // Random background
                    const randomBg = backgroundUrls[Math.floor(Math.random() * backgroundUrls.length)];
                    backgroundImage = await loadImage(randomBg);
                }
                ctx.drawImage(backgroundImage, 0, 0, width, height);
            } catch (error) {
                console.log('[Canvas] Background load failed, using gradient');
                // Tạo gradient background đẹp hơn
                const backgroundGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
                backgroundGradient.addColorStop(0, "#2D1B69");
                backgroundGradient.addColorStop(0.3, "#11998E");
                backgroundGradient.addColorStop(0.7, "#38EF7D");
                backgroundGradient.addColorStop(1, "#1E3C72");
                ctx.fillStyle = backgroundGradient;
                ctx.fillRect(0, 0, width, height);
            }

            // Overlay gradient
            const overlay = ctx.createLinearGradient(0, 0, 0, height);
            overlay.addColorStop(0, "rgba(30, 30, 53, 0.6)");
            overlay.addColorStop(0.5, "rgba(26, 37, 71, 0.6)");
            overlay.addColorStop(1, "rgba(19, 27, 54, 0.6)");
            ctx.fillStyle = overlay;
            ctx.fillRect(0, 0, width, height);

            // Avatar settings
            const xAvatar = 150;
            const widthAvatar = 200;
            const heightAvatar = 200;
            const yAvatar = height / 2 - heightAvatar / 2;

            // Welcome gradient colors - đẹp hơn và đa dạng hơn
            const gradientSets = [
                ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57"], // Sunset
                ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe"], // Purple Dream
                ["#43e97b", "#38f9d7", "#4facfe", "#00f2fe", "#43e97b"], // Ocean
                ["#fa709a", "#fee140", "#fa709a", "#fee140", "#fa709a"], // Pink Lemon
                ["#a8edea", "#fed6e3", "#d299c2", "#fef9d7", "#a8edea"], // Pastel
                ["#ff9a9e", "#fecfef", "#fecfef", "#ff9a9e", "#fad0c4"], // Rose
                ["#ffecd2", "#fcb69f", "#ff8a80", "#ff7043", "#ffecd2"]  // Warm
            ];
            const selectedSet = gradientSets[Math.floor(Math.random() * gradientSets.length)];
            const shuffledColors = [...selectedSet].sort(() => Math.random() - 0.5);

            // Draw avatar with gradient border
            if (userInfo.avatar) {
                try {
                    const avatar = await loadImage(userInfo.avatar);
                    const borderWidth = 8;
                    
                    // Create gradient for border
                    const gradient = ctx.createLinearGradient(
                        xAvatar - widthAvatar / 2 - borderWidth,
                        yAvatar - borderWidth,
                        xAvatar + widthAvatar / 2 + borderWidth,
                        yAvatar + heightAvatar + borderWidth
                    );

                    shuffledColors.forEach((color, index) => {
                        gradient.addColorStop(index / (shuffledColors.length - 1), color);
                    });

                    // Draw border
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(xAvatar, height / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
                    ctx.fillStyle = gradient;
                    ctx.fill();

                    // Draw avatar
                    ctx.beginPath();
                    ctx.arc(xAvatar, height / 2, widthAvatar / 2, 0, Math.PI * 2, true);
                    ctx.clip();
                    ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
                    ctx.restore();

                    // White line next to avatar
                    ctx.beginPath();
                    ctx.moveTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + 40);
                    ctx.lineTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + heightAvatar - 40);
                    ctx.strokeStyle = "white";
                    ctx.lineWidth = 3;
                    ctx.stroke();

                } catch (error) {
                    console.error("Lỗi load avatar:", error);
                }
            }

            // Text positioning
            const x1 = xAvatar + widthAvatar / 2 + 60;
            const x2 = x1 + (width - x1) / 2 - 20;
            let y1 = 100;

            // Function để vẽ text với shadow và glow
            function drawTextWithEffects(text, x, y, font, colors, shadowOffset = 3) {
                ctx.font = font;
                ctx.textAlign = "center";
                
                // Glow effect
                ctx.shadowColor = colors[0];
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Tạo gradient cho text
                const textGradient = ctx.createLinearGradient(x - 200, y - 40, x + 200, y);
                colors.slice(0, 3).forEach((color, index) => {
                    textGradient.addColorStop(index / 2, color);
                });
                
                // Vẽ shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillText(text, x + shadowOffset, y + shadowOffset);
                
                // Vẽ text chính
                ctx.fillStyle = textGradient;
                ctx.fillText(text, x, y);
                
                // Reset shadow
                ctx.shadowBlur = 0;
            }
            
            // Draw title with effects
            drawTextWithEffects(groupName, x2, y1, "bold 52px Arial, sans-serif", shuffledColors);

            // Draw username with effects
            let y2 = y1 + 65;
            const userName = userInfo.name || "";
            const welcomeText = memberCount > 1 ? 
                `Chào mừng ${userName} và ${memberCount - 1} thành viên khác` :
                `Chào mừng ${isAdmin ? "Đại Ca " : ""}${userName}`;
            drawTextWithEffects(welcomeText, x2, y2, "bold 44px Arial, sans-serif", shuffledColors.slice(1));

            // Draw subtitle with effects
            let y3 = y2 + 55;
            const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
            drawTextWithEffects(`Đã Tham Gia ${groupTypeText}`, x2, y3, "38px Arial, sans-serif", shuffledColors.slice(2));

            // Draw author with effects
            let y4 = y3 + 55;
            const authorText = userActionName === userName ? 
                "Tham Gia Trực Tiếp Hoặc Được Mời" : 
                `Duyệt bởi ${userActionName}`;
            drawTextWithEffects(authorText, x2, y4, "bold 34px Arial, sans-serif", shuffledColors.slice(3));

            // Save image
            const fileName = `welcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
            const filePath = path.join(tempPath, fileName);
            
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(filePath, buffer);
            
            return filePath;
        }

        const bannerPath = await createWelcomeCanvas();
        if (bannerPath) {
            console.log('[JoinNoti Canvas] Adding banner to attachments:', bannerPath);
            (messagePayload.attachments || (messagePayload.attachments = [])).push(bannerPath);
            tempFilePaths.push(bannerPath);
        } else {
            console.log('[JoinNoti Canvas] No banner created, sending text only');
        }

        await api.sendMessage(messagePayload, threadId, ThreadType.Group);

    } catch (error) {
        console.error("Lỗi trong welcome Canvas:", error);
        await api.sendMessage(`🎉 Chào mừng thành viên mới đã đến với nhóm! 🎉`, threadId, ThreadType.Group).catch(() => {});
    } finally {
        for (const filePath of tempFilePaths) {
            try { 
                await fs.unlink(filePath); 
                console.log('[JoinNoti Canvas] Cleaned up:', path.basename(filePath));
            } catch (_) {}
        }
    }
};