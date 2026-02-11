const axios = require('axios');
const fs = require("fs").promises;
const path = require("path");
const { createCanvas } = require('canvas');

module.exports.config = {
    name: "ytinfo",
    version: "1.0.0",
    role: 0,
    author: "NLam182",
    description: "Lấy thông tin kênh YouTube từ link",
    category: "Tiện ích",
    usage: "bonz yt info <link>",
    cooldowns: 3,
    dependencies: {},
    aliases: []
};

// Helper: Rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Helper: Wrap text
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// Tạo ảnh thông tin YouTube
async function createYouTubeInfoImage(data) {
    const width = 1000;
    const height = 850;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#ef4444');
    borderGradient.addColorStop(0.5, '#dc2626');
    borderGradient.addColorStop(1, '#b91c1c');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(220, 38, 38, 0.2)');
    headerGradient.addColorStop(1, 'rgba(185, 28, 28, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#ef4444');
    titleGradient.addColorStop(0.5, '#dc2626');
    titleGradient.addColorStop(1, '#b91c1c');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('🎬 YOUTUBE INFO', width / 2, 95);
    ctx.shadowBlur = 0;

    // Info card
    const cardY = 180;
    const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 60, cardY, width - 120, 560, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, cardY, width - 120, 560, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'left';
    let infoY = cardY + 60;

    // Channel Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('📺 Tiêu đề:', 100, infoY);
    
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 26px Arial';
    const titleLines = wrapText(ctx, data.title || 'N/A', 780);
    titleLines.forEach((line, i) => {
        ctx.fillText(line, 100, infoY + 35 + (i * 32));
    });
    
    infoY += 35 + (titleLines.length * 32) + 30;

    // Description
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('📝 Mô tả:', 100, infoY);
    
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '22px Arial';
    const desc = data.description || 'N/A';
    const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
    const descLines = wrapText(ctx, shortDesc, 780);
    descLines.slice(0, 2).forEach((line, i) => {
        ctx.fillText(line, 100, infoY + 35 + (i * 28));
    });
    
    infoY += 35 + (Math.min(descLines.length, 2) * 28) + 35;

    // Stats row 1
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('👥 Người đăng ký:', 100, infoY);
    
    const subGradient = ctx.createLinearGradient(0, infoY, width, infoY);
    subGradient.addColorStop(0, '#10b981');
    subGradient.addColorStop(1, '#059669');
    ctx.fillStyle = subGradient;
    ctx.font = 'bold 32px Arial';
    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(data.subscriber_count || 'N/A', 100, infoY + 40);
    ctx.shadowBlur = 0;
    
    infoY += 95;

    // Stats row 2
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('👁 Lượt xem:', 100, infoY);
    
    const viewGradient = ctx.createLinearGradient(0, infoY, width, infoY);
    viewGradient.addColorStop(0, '#3b82f6');
    viewGradient.addColorStop(1, '#2563eb');
    ctx.fillStyle = viewGradient;
    ctx.font = 'bold 32px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(data.view_count || 'N/A', 100, infoY + 40);
    ctx.shadowBlur = 0;
    
    infoY += 95;

    // Creation date
    if (data.creation_date) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('📅 Ngày tạo:', 100, infoY);
        
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 26px Arial';
        ctx.fillText(data.creation_date, 100, infoY + 35);
        
        infoY += 80;
    }

    // Channel ID
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('🆔 Channel ID:', 100, infoY);
    
    ctx.fillStyle = '#8b5cf6';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(data.channelId || 'N/A', 100, infoY + 30);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(220, 38, 38, 0.15)');
    footerGradient.addColorStop(1, 'rgba(185, 28, 28, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#ef4444');
    footerTextGradient.addColorStop(0.5, '#dc2626');
    footerTextGradient.addColorStop(1, '#b91c1c');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Arial';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

module.exports.run = async ({ args, event, api }) => {
    const { threadId, type } = event;
    
    // Kiểm tra chế độ silent mode
    const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
    if (interactionMode === 'silent') {
        return;
    }

    const link = args.join(' ').trim();
    
    try {
        const url = String(link || '').trim();
        if (!url || !/^https?:\/\//i.test(url) || !/youtube\.com|youtu\.be/i.test(url)) {
            return api.sendMessage('❌ Vui lòng nhập một đường link YouTube hợp lệ.\n📝 Cách dùng: bonz yt info <link>', threadId, type);
        }

        const headers = { 'User-Agent': 'Mozilla/5.0' };
        
        // Helper: parse basic fields from channel page HTML
        const parseChannelFromHtml = (html) => {
            const out = { title: '', description: '', subscriber_count: '', view_count: '', creation_date: '' };
            try {
                const get = (rx, idx = 1) => { 
                    const m = html.match(rx); 
                    return m && m[idx] ? String(m[idx]).trim() : ''; 
                };
                
                // OpenGraph
                out.title = get(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || out.title;
                out.description = get(/<meta\s+name="description"\s+content="([^"]+)"/i) || out.description;
                
                // JSON blobs: try to find subscriberCountText and viewCountText
                if (!out.subscriber_count) {
                    const m = html.match(/"subscriberCountText"\s*:\s*\{[^}]*?"simpleText"\s*:\s*"([^"]+)"/i);
                    if (m && m[1]) out.subscriber_count = m[1];
                }
                if (!out.subscriber_count) {
                    const m = html.match(/"subscriberCountText"\s*:\s*\{[^}]*?"runs"\s*:\s*\[\{\s*"text"\s*:\s*"([^"]+)"/i);
                    if (m && m[1]) out.subscriber_count = m[1];
                }
                
                // View count
                const viewM = html.match(/"viewCountText"\s*:\s*\{[^}]*?"simpleText"\s*:\s*"([^"]+)"/i);
                if (viewM && viewM[1]) out.view_count = viewM[1];
            } catch {}
            return out;
        };

        // Lấy Channel ID
        const uidApi = `https://api.mxhgiare.net/channel_id?link=${encodeURIComponent(url)}`;
        let channelId = '';
        
        try {
            const r1 = await axios.get(uidApi, { headers, timeout: 15000 });
            channelId = r1?.data?.channel_id || '';
        } catch (_) {}
        
        // Fallback: tự parse từ HTML của YouTube khi API không trả về channel_id
        if (!channelId) {
            try {
                const y = await axios.get(url, { headers, timeout: 20000 });
                const html = String(y?.data || '');
                
                // 1) Trực tiếp trong URL dạng /channel/UCxxxx
                const directMatch = url.match(/\/channel\/(UC[\w-]{22})/i);
                if (directMatch) channelId = directMatch[1];
                
                // 2) Tìm trong HTML các khóa thường gặp
                if (!channelId) {
                    const rxList = [
                        /"channelId":"(UC[\w-]{22})"/i,
                        /"externalId":"(UC[\w-]{22})"/i,
                        /"browseId":"(UC[\w-]{22})"/i,
                        /ytcfg\.set\({[^}]*"INNERTUBE_API_KEY"[^}]*\}\);[^U]*"UC[\w-]{22}"/i
                    ];
                    for (const rx of rxList) {
                        const m = html.match(rx);
                        if (m && m[1]) { 
                            channelId = m[1]; 
                            break; 
                        }
                        // trường hợp cuối cùng không có group 1
                        if (!channelId) {
                            const uc = html.match(/(UC[\w-]{22})/);
                            if (uc && uc[1]) { 
                                channelId = uc[1]; 
                                break; 
                            }
                        }
                    }
                }
            } catch {}
        }
        
        // Fallback: oEmbed để lấy author_url -> parse channel
        if (!channelId) {
            try {
                const oe = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { headers, timeout: 15000 });
                const authorUrl = oe?.data?.author_url || '';
                if (authorUrl) {
                    // tác giả có thể là /@handle hoặc /channel/UC...
                    const dm = authorUrl.match(/\/channel\/(UC[\w-]{22})/i);
                    if (dm) {
                        channelId = dm[1];
                    } else {
                        // fetch author page and parse
                        try {
                            const ap = await axios.get(authorUrl, { headers, timeout: 20000 });
                            const html = String(ap?.data || '');
                            const m1 = html.match(/"channelId":"(UC[\w-]{22})"/i) || html.match(/(UC[\w-]{22})/);
                            if (m1) channelId = m1[1] || m1[0];
                        } catch {}
                    }
                }
            } catch {}
        }
        
        if (!channelId) {
            return api.sendMessage('❌ Không tìm thấy Channel ID từ link YouTube đã cung cấp.', threadId, type);
        }

        // Thử lấy thông tin kênh qua API; nếu thất bại, scrape trực tiếp
        let title = '', description = '', subscriber_count = '', view_count = '', creation_date = '';
        
        try {
            const infoApi = `https://api.mxhgiare.net/youtube/info?channel_id=${encodeURIComponent(channelId)}`;
            const r2 = await axios.get(infoApi, { headers, timeout: 15000 });
            const data = r2?.data || {};
            title = data.title || '';
            description = data.description || '';
            subscriber_count = (data.subscriber_count ?? '').toString();
            view_count = (data.view_count ?? '').toString();
            creation_date = data.creation_date || '';
        } catch (e) {
            // ENOTFOUND hoặc lỗi khác -> scrape từ channel page
            try {
                const channelUrl = `https://www.youtube.com/channel/${channelId}`;
                const ch = await axios.get(channelUrl, { headers, timeout: 20000 });
                const parsed = parseChannelFromHtml(String(ch?.data || ''));
                title = parsed.title || title;
                description = parsed.description || description;
                subscriber_count = parsed.subscriber_count || subscriber_count;
                view_count = parsed.view_count || view_count;
            } catch {}
        }

        // Tạo ảnh canvas
        const tempPath = path.join(__dirname, '../../cache');
        try {
            await fs.mkdir(tempPath, { recursive: true });
        } catch (e) {
            console.error("Không thể tạo thư mục cache:", e);
        }

        // Debug: Log data
        console.log('YouTube Info Data:', {
            title,
            description: description?.substring(0, 50),
            subscriber_count,
            view_count,
            creation_date,
            channelId
        });

        const imageBuffer = await createYouTubeInfoImage({
            title,
            description,
            subscriber_count,
            view_count,
            creation_date,
            channelId
        });
        
        const imagePath = path.join(tempPath, `yt_info_${Date.now()}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        const lines = [
            '🎬 THÔNG TIN KÊNH YOUTUBE',
            '',
            `📺 Tiêu đề: ${title || 'N/A'}`,
            `👥 Người đăng ký: ${subscriber_count || 'N/A'}`,
            `👁 Lượt xem: ${view_count || 'N/A'}`,
            `📅 Ngày tạo: ${creation_date || 'N/A'}`,
            `🆔 Channel ID: ${channelId}`,
            '',
            `🔗 https://www.youtube.com/channel/${channelId}`
        ];
        
        await api.sendMessage({
            msg: lines.join('\n'),
            attachments: [imagePath]
        }, threadId, type);
        
        setTimeout(async () => {
            try {
                await fs.unlink(imagePath);
            } catch (_) {}
        }, 10000);
        
        return;
        
    } catch (e) {
        console.error("Lỗi lấy thông tin YouTube:", e);
        const msg = /ENOTFOUND|getaddrinfo/i.test(String(e?.message || e))
            ? '❌ Không kết nối được máy chủ API. Đã thử chế độ dự phòng nhưng không đủ dữ liệu. Vui lòng thử lại sau.'
            : `❌ Đã xảy ra lỗi khi lấy thông tin kênh: ${e?.message || e}`;
        return api.sendMessage(msg, threadId, type);
    }
};
