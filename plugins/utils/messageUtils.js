function collectIdsFromObject(target, ids) {
  if (!target || typeof target !== 'object') return;
  const props = ['globalMsgId', 'messageId', 'msgId', 'msgID', 'cliMsgId'];
  for (const key of props) {
    if (target[key]) ids.add(String(target[key]));
  }
}

function collectNested(target, ids) {
  collectIdsFromObject(target, ids);
  if (!target || typeof target !== 'object') return;

  const arrays = [
    target.messages,
    target.message,
    target.attachments,
    target.attachment,
    target.data?.messages,
  ];

  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      arr.forEach((item) => collectNested(item, ids));
    } else if (arr && typeof arr === 'object') {
      collectNested(arr, ids);
    }
  }

  collectIdsFromObject(target.data?.message, ids);
}

function collectMessageIds(sendResult) {
  const ids = new Set();
  collectNested(sendResult, ids);
  return Array.from(ids);
}

function collectReplyIds(reply) {
  if (!reply || typeof reply !== 'object') return [];
  const ids = new Set();

  const candidates = [
    reply.globalMsgId,
    reply.msgId,
    reply.msgID,
    reply.messageId,
    reply.cliMsgId,
    reply.data?.msgId,
    reply.data?.cliMsgId,
  ];

  for (const value of candidates) {
    if (value) ids.add(String(value));
  }

  if (Array.isArray(reply.attachments)) {
    for (const attachment of reply.attachments) {
      if (attachment?.msgId) ids.add(String(attachment.msgId));
      if (attachment?.cliMsgId) ids.add(String(attachment.cliMsgId));
    }
  }

  return Array.from(ids);
}

module.exports = {
  collectMessageIds,
  collectReplyIds,
};
