const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { TextStyle } = require('zca-js');
const { getMessageCache } = require('../../utils/index');

module.exports.config = {
  name: 'adc',
  version: '1.0.0',
  role: 2,
  author: 'ShinTHL09', // phát triển từ mdl gốc của D-Jukie
  description: 'Áp dụng code hoặc tải code lên',
  category: 'Hệ Thống',
  usages: 'adc [reply hoặc tên file]',
  cooldowns: 2,
  dependencies: { "cheerio": "" }
};

function sendStyledMessage(api, threadId, type, msg, style = TextStyle.Green) {
  const text = typeof msg === 'string' ? msg : String(msg ?? '');
  const styles = Array.isArray(style)
    ? style
    : [{ start: 0, len: text.length, st: style }];
  return api.sendMessage({
    msg: text,
    styles
  }, threadId, type);
}

function buildMultiColorStyle(text) {
  const cleanText = typeof text === 'string' ? text : String(text ?? '');
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;

  while (cursor < cleanText.length) {
    const remaining = cleanText.length - cursor;
    const chunkSize = Math.min(remaining, Math.max(1, Math.floor(Math.random() * 8) + 3));
    const st = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st });
    cursor += chunkSize;
  }

  return styles;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;

  if (!args[0]) return sendStyledMessage(api, threadId, type, "Vui lòng nhập tên file hoặc reply link chứa code!", buildMultiColorStyle("Vui lòng nhập tên file hoặc reply link chứa code!"));

  const name = args[0].replace(/\.js$/, '');
  let link;

  if (data?.quote?.cliMsgId) {
    const messageCache = getMessageCache()[data.quote.cliMsgId];
    link = messageCache?.content?.trim();
  }

  if (!link) {
    const filePath = path.join(__dirname, `${name}.js`);
    try {
      const fileData = fs.readFileSync(filePath, "utf-8");
      const dpasteUrl = await uploadToDpaste(fileData);
      return sendStyledMessage(api, threadId, type, `${dpasteUrl}`, buildMultiColorStyle(dpasteUrl));
    } catch {
      return sendStyledMessage(api, threadId, type, `Không tìm thấy file "${name}.js" để upload.`, buildMultiColorStyle(`Không tìm thấy file "${name}.js" để upload.`));
    }
  }

  const urlRegex = /https?:\/\/[^\s]+/g;
  const matched = link.match(urlRegex);
  if (!matched || matched.length === 0) {
    return sendStyledMessage(api, threadId, type, "Vui lòng chỉ reply 1 link hợp lệ!", buildMultiColorStyle("Vui lòng chỉ reply 1 link hợp lệ!"));
  }

  const url = matched[0];

  try {
    if (url.includes('pastebin')) {
      const { data } = await axios.get(url);
      await writeCodeToFile(name, data, api, threadId, type);
    }

    else if (url.includes('dpaste.com')) {
      const rawUrl = url.endsWith('.txt') ? url : `${url}.txt`;
      const { data } = await axios.get(rawUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      await writeCodeToFile(name, data, api, threadId, type);
    }

    else if (url.includes('buildtool') || url.includes('tinyurl.com')) {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const codeBlock = $('.language-js').first();
      const code = codeBlock?.text()?.trim();

      if (!code) {
        return sendStyledMessage(api, threadId, type, 'Không tìm thấy code trong trang.', buildMultiColorStyle('Không tìm thấy code trong trang.'));
      }

      await writeCodeToFile(name, code, api, threadId, type);
    }

    else if (url.includes('drive.google')) {
      const idMatch = url.match(/[-\w]{25,}/);
      if (!idMatch) return sendStyledMessage(api, threadId, type, "Không lấy được ID từ link Google Drive.", buildMultiColorStyle("Không lấy được ID từ link Google Drive."));
      const fileID = idMatch[0];
      const savePath = path.join(__dirname, `${name}.js`);
      await downloadFile(`https://drive.google.com/u/0/uc?id=${fileID}&export=download`, savePath);
      return sendStyledMessage(api, threadId, type, `Đã tải plugin "${name}.js". Hãy dùng cmd load ${name} để sử dụng.`, buildMultiColorStyle(`Đã tải plugin "${name}.js". Hãy dùng cmd load ${name} để sử dụng.`));
    }

    else {
      return sendStyledMessage(api, threadId, type, "Không hỗ trợ link này.", buildMultiColorStyle("Không hỗ trợ link này."));
    }
  } catch (err) {
    return sendStyledMessage(api, threadId, type, `Lỗi khi xử lý: ${err.message}`, buildMultiColorStyle(`Lỗi khi xử lý: ${err.message}`));
  }
};

async function writeCodeToFile(name, code, api, threadId, type) {
  const filePath = path.join(__dirname, `${name}.js`);
  fs.writeFile(filePath, code, 'utf-8', (err) => {
    if (err) {
      return sendStyledMessage(api, threadId, type, `Không thể ghi file "${name}.js".`, buildMultiColorStyle(`Không thể ghi file "${name}.js".`));
    }
    sendStyledMessage(api, threadId, type, `Đã tải plugin "${name}.js". Hãy dùng cmd load ${name} để sử dụng.`, buildMultiColorStyle(`Đã tải plugin "${name}.js". Hãy dùng cmd load ${name} để sử dụng.`));
  });
}

async function uploadToDpaste(code) {
  try {
    const response = await axios.post(
      'https://dpaste.com/api/v2/',
      `content=${encodeURIComponent(code)}&syntax=text&expiry_days=7`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    if (response.data?.startsWith('https://dpaste.com/')) {
      return response.data.trim() + '.txt';
    } else {
      throw new Error('Phản hồi không hợp lệ từ Dpaste.');
    }
  } catch (error) {
    throw new Error("Không thể upload lên dpaste: " + error.message);
  }
}

async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}
