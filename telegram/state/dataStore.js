const store = new Map();

function ensure(chatId) {
  const key = String(chatId || 'global');
  if (!store.has(key)) {
    store.set(key, {
      todos: [],
      reminders: [],
      flashcards: [],
      studyPlan: null,
      healthNotes: [],
    });
  }
  return store.get(key);
}

function get(chatId) {
  return ensure(chatId);
}

function update(chatId, updater) {
  const data = ensure(chatId);
  const result = typeof updater === 'function' ? updater(data) : { ...data, ...updater };
  store.set(String(chatId || 'global'), result);
  return result;
}

module.exports = {
  get,
  update,
};
