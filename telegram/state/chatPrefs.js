const store = new Map();

function ensure(chatId) {
  const key = String(chatId || 'global');
  if (!store.has(key)) {
    store.set(key, {
      lang: 'vi',
      welcome: 'Chào mừng bạn đến với nhóm!',
      rules: [],
      antiSpam: false,
      muted: false,
      custom: {},
      lastLocation: null,
      lastCoords: null,
    });
  }
  return store.get(key);
}

function get(chatId) {
  return ensure(chatId);
}

function update(chatId, data = {}) {
  const current = ensure(chatId);
  const next = { ...current, ...data };
  store.set(String(chatId || 'global'), next);
  return next;
}

function pushRule(chatId, ruleText) {
  const config = ensure(chatId);
  config.rules.push(ruleText);
  return config.rules.slice();
}

function clearRules(chatId) {
  const config = ensure(chatId);
  config.rules = [];
  return config.rules;
}

module.exports = {
  get,
  update,
  pushRule,
  clearRules,
};
