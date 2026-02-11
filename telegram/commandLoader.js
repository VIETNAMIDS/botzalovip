const { buildCommandDefinitions } = require('./commands');

function parseArgs(text = '', commandName = '') {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('/')) return [];
  const withoutSlash = normalized.slice(1);
  const [commandToken, ...rest] = withoutSlash.split(' ');
  const commandOnly = commandToken.includes('@') ? commandToken.split('@')[0] : commandToken;
  if (commandOnly !== commandName) return [];
  const payload = rest.join(' ').trim();
  if (!payload) return [];
  return payload.match(/(?:"[^"]+"|'[^']+'|\S+)/g)?.map((token) => token.replace(/^['"]|['"]$/g, '')) || [];
}

module.exports = function registerTelegramCommands(bot, helpers = {}) {
  const definitions = buildCommandDefinitions(helpers) || [];
  const uniqueNames = new Set();
  const stats = {
    total: definitions.length,
    categories: {},
    names: [],
  };

  for (const def of definitions) {
    if (!def || !def.name || typeof def.run !== 'function') continue;
    const baseName = String(def.name).trim();
    if (!baseName || uniqueNames.has(baseName)) {
      helpers.pushTail?.(`[tele-cmd] Bỏ qua lệnh trùng tên: ${baseName}`);
      continue;
    }

    uniqueNames.add(baseName);
    stats.categories[def.category || 'khác'] = (stats.categories[def.category || 'khác'] || 0) + 1;
    stats.names.push(baseName);
    helpers.pushTail?.(`[tele-cmd] đăng ký /${baseName}`);

    const handler = async (ctx) => {
      try {
        const args = parseArgs(ctx?.message?.text || '', baseName);
        if (def.adminOnly && !helpers.isAdmin?.(ctx)) {
          if (helpers.replyNotAllowed) {
            await helpers.replyNotAllowed(ctx);
          } else {
            await ctx.reply('⛔ Lệnh này chỉ dành cho admin.');
          }
          return;
        }

        await def.run({ ctx, args, helpers, definition: def });
      } catch (error) {
        const msg = `[tele-cmd] Lỗi khi xử lý /${baseName}: ${error?.message || error}`;
        helpers.pushTail?.(msg);
        console.error(msg);
        try {
          await ctx.reply('⚠️ Lệnh gặp lỗi, hãy thử lại sau.');
        } catch {}
      }
    };

    bot.command(baseName, handler);
    const aliases = Array.isArray(def.aliases) ? def.aliases : [];
    for (const alias of aliases) {
      if (!alias) continue;
      const aliasName = String(alias).trim();
      if (!aliasName) continue;
      bot.command(aliasName, handler);
    }
  }

  const menuCommands = Array.from(uniqueNames)
    .slice(0, 100)
    .map((name) => {
      const def = definitions.find((d) => d.name === name);
      return {
        command: name,
        description: (def?.description || 'Lệnh Telegram mở rộng').slice(0, 256),
      };
    });

  if (menuCommands.length) {
    bot.telegram
      .setMyCommands(menuCommands)
      .then(() => helpers.pushTail?.(`[tele-cmd] cập nhật menu với ${menuCommands.length} lệnh`))
      .catch((err) => helpers.pushTail?.(`[tele-cmd] setMyCommands lỗi: ${err?.message || err}`));
  }

  helpers.setCommandStats?.(stats);
  return stats;
};
