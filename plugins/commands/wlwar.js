module.exports.config = {
  name: "wlwar",
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Quản lý whitelist WAR cho thread: add/remove/list/toggle",
  category: "Hệ thống",
  usage: "wlwar <menu|add|remove|list|toggle|imei|imel|cookie> [here|<threadId>|on|off|<imei>|show|<cookie>]",
  cooldowns: 2
};

async function ensureWarWLStructure(Threads, threadId) {
  const tdata = await Threads.getData(threadId).catch(() => null);
  const data = tdata?.data || {};
  if (!data.war_whitelist) {
    data.war_whitelist = { enabled: true, threads: [] };
    await Threads.setData(threadId, data);
  }
  return data;
}

function isAdminUser(uid) {
  const owners = (global?.config?.owner_bot || []).map(String);
  const admins = (global?.users?.admin || []).map(String);
  return owners.includes(String(uid)) || admins.includes(String(uid));
}

module.exports.run = async ({ args, event, api, Threads }) => {
  const { threadId, type, data } = event;

  // Silent mode guard (consistent with other commands)
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hoá hoàn toàn trong chế độ silent
  }

  const senderId = data?.uidFrom || event?.authorId;
  if (!isAdminUser(senderId)) {
    return api.sendMessage("❌ Chỉ admin/owner mới được dùng lệnh này.", threadId, type);
  }

  let sub = (args[0] || '').toLowerCase();
  if (sub === 'imel') sub = 'imei';
  const arg1 = (args[1] || '').toLowerCase();

  try {
    switch (sub) {
      case 'menu': {
        const menu = [
          '╔════════════════════════════════════════════════════════════════════╗',
          '║                           ZALO TOOL MENU                           ║',
          '╠════════════════════════════════════════════════════════════════════╣',
          '║ 1. 🚀 Multi-Acc Spam                                                ║',
          '║ 2. 🏷️ Spam + Tag (@All xanh)                                        ║',
          '║ 0. ❌ Thoát                                                         ║',
          '╚════════════════════════════════════════════════════════════════════╝',
          '👉 Chọn chức năng:'
        ].join('\n');
        return api.sendMessage(menu, threadId, type);
      }

      case 'cookie': {
        // wlwar cookie <value>  -> set cookie string for current thread
        // wlwar cookie show     -> show current cookie (raw string)
        const tdata = await Threads.getData(threadId).catch(() => null);
        const data = tdata?.data || {};
        data.war_whitelist = data.war_whitelist || { enabled: true, threads: [] };

        const value = args.slice(1).join(' '); // allow spaces and JSON-like strings
        if (!value) {
          // interactive mode
          global.__wlwarAwait = global.__wlwarAwait || { cookie: new Map(), imei: new Map() };
          global.__wlwarAwait.cookie.set(String(threadId), { by: String(data?.uidFrom || event?.authorId), at: Date.now() });
          return api.sendMessage("📥 Hãy gửi cookie (chuỗi hoặc JSON) trong tin nhắn kế tiếp.", threadId, type);
        }
        if (value.toLowerCase() === 'show') {
          const current = data.war_whitelist.cookie || '(chưa thiết lập)';
          return api.sendMessage(`Cookie hiện tại của thread: ${current}`, threadId, type);
        }

        const cookieStr = String(value).trim();
        if (!cookieStr) {
          return api.sendMessage("❌ Cookie không hợp lệ.", threadId, type);
        }

        data.war_whitelist.cookie = cookieStr;
        await Threads.setData(threadId, data);
        return api.sendMessage(`✅ Đã lưu Cookie cho thread hiện tại.`, threadId, type);
      }
      case 'add': {
        const data = await ensureWarWLStructure(Threads, threadId);
        let targetTid = arg1 === 'here' || !arg1 ? threadId : args[1];
        if (!targetTid) return api.sendMessage("❌ Thiếu threadId.", threadId, type);
        const set = new Set((data.war_whitelist.threads || []).map(String));
        set.add(String(targetTid));
        data.war_whitelist.threads = Array.from(set);
        await Threads.setData(threadId, data);
        return api.sendMessage(`✅ Đã thêm thread ${targetTid} vào whitelist WAR.`, threadId, type);
      }

      case 'remove':
      case 'rm': {
        const data = await ensureWarWLStructure(Threads, threadId);
        let targetTid = arg1 === 'here' || !arg1 ? threadId : args[1];
        const before = data.war_whitelist.threads || [];
        const after = before.filter(t => String(t) !== String(targetTid));
        data.war_whitelist.threads = after;
        await Threads.setData(threadId, data);
        return api.sendMessage(`✅ Đã gỡ thread ${targetTid} khỏi whitelist WAR.`, threadId, type);
      }

      case 'toggle': {
        const data = await ensureWarWLStructure(Threads, threadId);
        let next;
        if (arg1 === 'on') next = true; else if (arg1 === 'off') next = false; else next = !data.war_whitelist.enabled;
        data.war_whitelist.enabled = next;
        await Threads.setData(threadId, data);
        return api.sendMessage(`✅ WAR whitelist hiện ${next ? 'BẬT' : 'TẮT'}.`, threadId, type);
      }

      case 'list': {
        const tdata = await Threads.getData(threadId).catch(() => null);
        const wl = tdata?.data?.war_whitelist || { enabled: false, threads: [] };
        const lines = [
          `Trạng thái: ${wl.enabled ? 'BẬT' : 'TẮT'}`,
          `Số thread: ${wl.threads?.length || 0}`,
          `Danh sách:`,
          ...(wl.threads || []).map((t, i) => `${i + 1}. ${t}${String(t) === String(threadId) ? ' (this)' : ''}`)
        ];
        return api.sendMessage("--- WAR WHITELIST ---\n" + lines.join('\n'), threadId, type);
      }

      case 'imei': {
        // wlwar imei <value>  -> set IMEI for current thread
        // wlwar imei show     -> show current IMEI
        const tdata = await Threads.getData(threadId).catch(() => null);
        const data = tdata?.data || {};
        data.war_whitelist = data.war_whitelist || { enabled: true, threads: [] };

        const value = args[1] || '';
        if (value === '') {
          // interactive mode
          global.__wlwarAwait = global.__wlwarAwait || { cookie: new Map(), imei: new Map() };
          global.__wlwarAwait.imei.set(String(threadId), { by: String(data?.uidFrom || event?.authorId), at: Date.now() });
          return api.sendMessage("📥 Hãy gửi IMEI trong tin nhắn kế tiếp.", threadId, type);
        }
        if (value.toLowerCase() === 'show') {
          const current = data.war_whitelist.imei || '(chưa thiết lập)';
          return api.sendMessage(`IMEI hiện tại của thread: ${current}`, threadId, type);
        }

        // Basic validation: non-empty string
        const imei = String(value).trim();
        if (!imei) {
          return api.sendMessage("❌ IMEI không hợp lệ.", threadId, type);
        }

        data.war_whitelist.imei = imei;
        await Threads.setData(threadId, data);
        return api.sendMessage(`✅ Đã lưu IMEI cho thread hiện tại: ${imei}`, threadId, type);
      }

      default: {
        return api.sendMessage(
          "Quản lý WHITELIST WAR\n\n" +
          "wlwar menu - Hiển thị menu WAR\n" +
          "wlwar add [here|threadId] - Thêm thread vào whitelist WAR\n" +
          "wlwar remove [here|threadId] - Gỡ thread khỏi whitelist WAR\n" +
          "wlwar toggle [on|off] - Bật/Tắt cơ chế whitelist WAR\n" +
          "wlwar list - Xem danh sách whitelist WAR\n" +
          "wlwar imei|imel <value|show> - Điền/hiển thị IMEI cho thread hiện tại\n" +
          "wlwar cookie <value|show> - Điền/hiển thị Cookie cho thread hiện tại",
          threadId, type
        );
      }
    }
  } catch (e) {
    return api.sendMessage(`❌ Lỗi: ${e?.message || e}`, threadId, type);
  }
};

// Capture next message for interactive input
module.exports.handleEvent = async ({ api, event, eventType, Threads }) => {
  if (eventType !== 'message') return;
  const { threadId, type, data } = event;
  if (!threadId) return;

  const text = typeof data?.content === 'string' ? data.content.trim() : '';
  if (!text) return;

  const sender = String(data?.uidFrom || event?.authorId || '');
  const wait = global.__wlwarAwait;
  if (!wait) return;

  // Cookie awaiting
  if (wait.cookie?.has(String(threadId))) {
    const ctx = wait.cookie.get(String(threadId));
    if (!ctx || ctx.by !== sender) return;
    // Save cookie
    try {
      const tdata = await Threads.getData(threadId).catch(() => null);
      const d = tdata?.data || {};
      d.war_whitelist = d.war_whitelist || { enabled: true, threads: [] };
      d.war_whitelist.cookie = text;
      await Threads.setData(threadId, d);
      wait.cookie.delete(String(threadId));
      return api.sendMessage('✅ Đã lưu Cookie cho thread hiện tại.', threadId, type);
    } catch (e) {
      return api.sendMessage(`❌ Lỗi lưu Cookie: ${e?.message || e}`, threadId, type);
    }
  }

  // IMEI awaiting
  if (wait.imei?.has(String(threadId))) {
    const ctx = wait.imei.get(String(threadId));
    if (!ctx || ctx.by !== sender) return;
    const imei = text;
    if (!imei) return api.sendMessage('❌ IMEI không hợp lệ.', threadId, type);
    try {
      const tdata = await Threads.getData(threadId).catch(() => null);
      const d = tdata?.data || {};
      d.war_whitelist = d.war_whitelist || { enabled: true, threads: [] };
      d.war_whitelist.imei = imei;
      await Threads.setData(threadId, d);
      wait.imei.delete(String(threadId));
      return api.sendMessage('✅ Đã lưu IMEI cho thread hiện tại.', threadId, type);
    } catch (e) {
      return api.sendMessage(`❌ Lỗi lưu IMEI: ${e?.message || e}`, threadId, type);
    }
  }
};
