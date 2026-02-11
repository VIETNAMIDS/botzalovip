const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const AUTO_DELETE_TTL = 60000;

module.exports.config = {
  name: 'ggim',
  aliases: ['anh'],
  version: '2.0.0',
  role: 0,
  author: 'Cascade - Upgraded',
  description: 'Tìm và gửi ảnh theo từ khóa (Google Images) - Nâng cấp',
  category: 'Tiện ích',
  usage: 'gg im <từ khóa> [&& số lượng]',
  cooldowns: 3
};

const CONFIG = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br'
  },
  maxSend: 15, // Tăng từ 5 lên 15
  maxExtract: 100, // Số ảnh tối đa để extract từ Google
  timeout: 20000,
  parallelDownload: 3 // Tải song song 3 ảnh cùng lúc
};

// Hàm extract ảnh từ Google Images - CẢI TIẾN
async function searchGoogleImages(query) {
  const images = new Set();
  
  try {
    // Tìm kiếm với nhiều tham số khác nhau để lấy nhiều ảnh hơn
    const searchParams = [
      { q: query, tbm: 'isch', hl: 'vi' },
      { q: query, tbm: 'isch', hl: 'en', safe: 'off' },
      { q: query, tbm: 'isch', tbs: 'isz:l' }, // Ảnh lớn
    ];

    for (const params of searchParams) {
      const url = `https://www.google.com/search?${new URLSearchParams(params).toString()}`;
      
      try {
        const res = await axios.get(url, { 
          headers: CONFIG.headers, 
          timeout: CONFIG.timeout 
        });
        const $ = cheerio.load(res.data);

        // Phương pháp 1: Extract từ script tags
        $('script').each((_, el) => {
          const sc = $(el).html();
          if (!sc) return;
          
          try {
            // Tìm tất cả URLs trong script
            const urlMatches = sc.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)/gi) || [];
            urlMatches.forEach(url => {
              if (!url.includes('encrypted-tbn0.gst') && 
                  !url.includes('gstatic.com') &&
                  images.size < CONFIG.maxExtract) {
                images.add(url);
              }
            });

            // Extract từ data structure cũ
            const start = sc.indexOf('var m={');
            if (start !== -1) {
              const end = sc.indexOf('var a=m;', start);
              if (end !== -1) {
                const chunk = sc.substring(start + 6, end).trim();
                const matches = chunk.match(/\["(https:\/\/[^\"]+)",\s*(\d+),\s*(\d+)\]/g) || [];
                for (const m of matches) {
                  try {
                    const arr = JSON.parse(m);
                    const link = arr[0];
                    if (link && !link.includes('encrypted-tbn0.gst') && images.size < CONFIG.maxExtract) {
                      images.add(link);
                    }
                  } catch (_) {}
                }
              }
            }
          } catch (_) {}
        });

        // Phương pháp 2: Extract từ img tags
        $('img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src');
          if (src && 
              src.startsWith('http') && 
              !src.includes('encrypted-tbn0.gst') &&
              !src.includes('gstatic.com') &&
              images.size < CONFIG.maxExtract) {
            images.add(src);
          }
        });

        if (images.size >= CONFIG.maxExtract) break;
      } catch (e) {
        continue;
      }
    }
  } catch (err) {
    console.error('Search error:', err.message);
  }

  return Array.from(images);
}

// Hàm tải ảnh song song
async function downloadImages(urls, count) {
  const downloaded = [];
  const tempDir = path.join(__dirname, '../../cache');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const availableUrls = [...urls];
  let processing = 0;
  let index = 0;

  return new Promise((resolve) => {
    const tryDownload = async () => {
      if (downloaded.length >= count || availableUrls.length === 0) {
        if (processing === 0) {
          resolve(downloaded);
        }
        return;
      }

      if (processing >= CONFIG.parallelDownload) return;

      const url = availableUrls.shift();
      if (!url) return;

      processing++;
      const tempPath = path.join(tempDir, `ggim_${Date.now()}_${index++}_${Math.random().toString(36).slice(2)}.jpg`);

      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: CONFIG.timeout,
          headers: CONFIG.headers,
          maxRedirects: 5
        });

        // Kiểm tra content type
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('image')) {
          fs.writeFileSync(tempPath, response.data);
          
          // Kiểm tra file size > 5KB
          const stats = fs.statSync(tempPath);
          if (stats.size > 5000) {
            downloaded.push(tempPath);
          } else {
            fs.unlinkSync(tempPath);
          }
        }
      } catch (e) {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }

      processing--;
      
      // Tiếp tục tải
      setImmediate(tryDownload);
      if (processing < CONFIG.parallelDownload) {
        setImmediate(tryDownload);
      }
    };

    // Bắt đầu tải song song
    for (let i = 0; i < CONFIG.parallelDownload; i++) {
      tryDownload();
    }
  });
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event.authorId;
  const senderName = data?.dName || 'Bạn';

  const rawInput = (args || []).join(' ').trim();
  if (!rawInput) {
    return sendAutoDelete(api, threadId, type, `${senderName} Vui lòng nhập từ khóa tìm kiếm. Ví dụ: gg im anime girl && 10`);
  }

  let keyword = rawInput;
  let requestedCount = 1;

  // Parse input
  const ampParts = rawInput.split('&&').map(p => p.trim()).filter(Boolean);
  if (ampParts.length >= 2) {
    keyword = ampParts[0];
    const parsed = parseInt(ampParts[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      requestedCount = parsed;
    }
  } else {
    const match = rawInput.match(/^(.*?)(?:\s+|^)(\d{1,2})$/);
    if (match) {
      const [, kw, num] = match;
      if (kw && kw.trim().length) {
        keyword = kw.trim();
        const parsed = parseInt(num, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          requestedCount = parsed;
        }
      }
    }
  }

  if (!keyword || !keyword.trim()) {
    return sendAutoDelete(api, threadId, type, `${senderName} Vui lòng nhập từ khóa tìm kiếm.`);
  }

  keyword = keyword.trim();
  const cappedCount = Math.max(1, Math.min(CONFIG.maxSend, requestedCount));

  const query = keyword.toLowerCase();

  try {
    await sendAutoDelete(api, threadId, type, { msg: `[${senderName}] 🔍 Đang tìm kiếm "${keyword}" (${cappedCount} ảnh)...` });

    const urls = await searchGoogleImages(query);
    
    if (!urls.length) {
      return sendAutoDelete(api, threadId, type, `${senderName} ❌ Không tìm thấy ảnh. Vui lòng thử từ khóa khác.`);
    }

    await sendAutoDelete(api, threadId, type, { msg: `[${senderName}] 📥 Tìm thấy ${urls.length} ảnh, đang tải xuống ${cappedCount} ảnh...` });

    const imagePaths = await downloadImages(urls, cappedCount);

    if (!imagePaths.length) {
      return sendAutoDelete(api, threadId, type, `${senderName} ❌ Không thể tải ảnh. Vui lòng thử lại sau.`);
    }

    // Gửi từng ảnh
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        await sendAutoDelete(api, threadId, type, {
          msg: `[${senderName}] 📸 [${keyword}] (${i + 1}/${imagePaths.length})`,
          attachments: [imagePaths[i]]
        });
      } catch (e) {
        console.error('Send error:', e.message);
      }
    }

    // Dọn dẹp files
    imagePaths.forEach(p => {
      fs.unlink(p, () => {});
    });

    if (imagePaths.length < cappedCount) {
      await sendAutoDelete(api, threadId, type, `${senderName} ✅ Đã gửi ${imagePaths.length}/${cappedCount} ảnh (một số ảnh không tải được).`);
    } else {
      await sendAutoDelete(api, threadId, type, `${senderName} ✅ Hoàn thành! Đã gửi ${imagePaths.length} ảnh.`);
    }

  } catch (err) {
    console.error('Run error:', err);
    return sendAutoDelete(api, threadId, type, `${senderName} ❌ Lỗi khi tìm kiếm ảnh. Vui lòng thử lại sau.`);
  }
};

function sendAutoDelete(api, threadId, type, payload) {
  const message = typeof payload === 'string' ? { msg: payload } : payload || {};
  return api.sendMessage({ ...message, ttl: AUTO_DELETE_TTL }, threadId, type);
}