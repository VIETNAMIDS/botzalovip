const axios = require('axios');

module.exports.config = {
  name: 'giaitoan',
  aliases: ['math', 'giải toán', 'giaitoan'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Giải toán bằng OpenAI/Gemini (tự động chọn) + fallback tính cục bộ an toàn',
  category: 'Tiện ích',
  usage: 'bonz giải toán <biểu_thức | mô tả bài toán>',
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const prompt = (args || []).join(' ').trim();
    if (!prompt) {
      const help = [
        'Bảng thông tin dịch vụ',
        `ng dùng: ${userName}`,
        'dịch vụ : bonz giải toán',
        `id ng dùng: ${senderId}`,
        'cấp bậc: Thành viên',
        'số lượt dùng: 0',
        'thông báo: Thiếu đề bài/biểu thức',
        'cách dùng:',
        '- bonz giải toán 2+2*3',
        '- bonz giaitoan căn bậc hai của 144',
        '- bonz math đạo hàm của x^2'
      ].join('\n');
      return api.sendMessage(help, threadId, type);
    }

    const cfg = global?.config || {};
    const openaiKey = process.env.OPENAI_API_KEY || cfg?.openai_key || '';
    // Cho phép nhiều key Gemini: ENV GEMINI_API_KEYS="k1,k2" hoặc config.gemini_api_keys: [k1, k2]
    const geminiKeys = (
      (process.env.GEMINI_API_KEYS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
    if (Array.isArray(cfg?.gemini_api_keys)) {
      for (const k of cfg.gemini_api_keys) {
        if (k && !geminiKeys.includes(k)) geminiKeys.push(k);
      }
    }

    let answer = '';

    // 1) Ưu tiên OpenAI nếu có key
    if (!answer && openaiKey) {
      try {
        const sys = 'Bạn là trợ lý toán học. Hãy giải bài toán ngắn gọn, có các bước chính và nêu kết quả cuối cùng rõ ràng. Trả lời bằng tiếng Việt.';
        const res = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: `Bài toán: ${prompt}` }
            ],
            temperature: 0.2,
            max_tokens: 600
          },
          { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        answer = res?.data?.choices?.[0]?.message?.content?.trim() || '';
      } catch (_) {}
    }

    // 2) Nếu chưa có, thử Gemini với danh sách key xoay vòng
    if (!answer && geminiKeys.length > 0) {
      for (const key of geminiKeys) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
          const body = {
            contents: [
              { role: 'user', parts: [{ text: `Hãy giải bài toán sau bằng tiếng Việt, súc tích, nêu kết quả cuối cùng rõ ràng:\n${prompt}` }] }
            ]
          };
          const resp = await axios.post(url, body, { timeout: 20000 });
          const c = resp?.data?.candidates?.[0];
          const parts = c?.content?.parts || [];
          const text = parts.map(p => p?.text).filter(Boolean).join('\n').trim();
          if (text) { answer = text; break; }
        } catch (_) { /* thử key kế tiếp */ }
      }
    }

    // 3) Fallback: máy tính cục bộ an toàn cho các biểu thức đơn giản
    function localCalc(expr) {
      try {
        let s = String(expr || '').trim();
        if (!/^[0-9+\-*/().,^\sA-Za-z]+$/.test(s)) return null; // chặn ký tự lạ
        s = s.replace(/\^/g, '**');
        s = s.replace(/\bpi\b/gi, 'Math.PI').replace(/\be\b/gi, 'Math.E');
        const funcs = ['sin','cos','tan','asin','acos','atan','log','sqrt','abs','ceil','floor','round','exp','pow','min','max'];
        for (const f of funcs) {
          const rx = new RegExp(`\\b${f}\\s*\\(`, 'gi');
          s = s.replace(rx, `Math.${f}(`);
        }
        const letters = s.match(/[A-Za-z_]+/g) || [];
        for (const w of letters) {
          if (!/^Math\.(PI|E|sin|cos|tan|asin|acos|atan|log|sqrt|abs|ceil|floor|round|exp|pow|min|max)$/.test(w)) {
            return null;
          }
        }
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + s + ');')();
        if (typeof result === 'number' && isFinite(result)) return result;
        return null;
      } catch { return null; }
    }

    if (!answer) {
      const local = localCalc(prompt);
      if (local !== null) answer = String(local);
    }

    if (!answer) {
      answer = 'Không có kết quả khả dụng từ OpenAI/Gemini và không nhận dạng được biểu thức để tính cục bộ.';
    }

    const header = [
      'Bảng thông tin dịch vụ',
      `ng dùng: ${userName}`,
      'dịch vụ : bonz giải toán',
      `id ng dùng: ${senderId}`,
      'cấp bậc: Thành viên',
      'số lượt dùng: 1',
      'thông báo: Thành công'
    ].join('\n');

    const details = ['','🧮 Đề bài: ', prompt, '', '✅ Kết quả:', String(answer)].join('\n');
    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể giải toán lúc này. Vui lòng thử lại sau.', event.threadId, event.type);
  }
};
