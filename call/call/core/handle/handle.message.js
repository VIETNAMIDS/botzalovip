import { ThreadType, Reactions } from "../../zca-gwendev/dist/index.js";
import { run } from "../handle/handle.commands.js";
import { getPrefix } from "../database/mysql/database.js";
import { getUserMute } from "../database/sqlite/database.js";

export function message({ api, prefix, commands }) {
    return async function onMessage(message) {
        try {
            const isGroup = Number(message?.type) === 1;
            const data = message?.data || {};
            const content = data.content ?? data.text ?? data.message ?? data.body ?? "";
            const text = typeof content === "string" ? content : "";
            const threadId = message?.threadId;
            const threadType = isGroup ? ThreadType.Group : ThreadType.User;
            const loginId = message.loginId || "default";
            const ctx = {
                data,
                threadId,
                threadType,
                isGroup,
                raw: message,
                loginId
            };
            try {
                const uidFrom = data?.uidFrom || data?.uid || message?.senderId;
                if (uidFrom) {
                    const mute = await getUserMute(uidFrom, loginId);
                    if (mute && mute.mute_time && mute.mute_time > Date.now()) {
                        try {
                            const dest = {
                                type: threadType,
                                threadId,
                                data: {
                                    msgId: data.msgId || data.messageId || 0,
                                    cliMsgId: (data?.content && (data.content.cliMsgId ?? data.content.clientMsgId)) || data.cliMsgId || data.clientMsgId || 0,
                                    uidFrom: uidFrom
                                }
                            };
                            await api.deleteMessage(dest, false);
                        } catch {}
                        return; 
                    }
                }
            } catch {}

            const dbPrefix = prefix || (await getPrefix(loginId));
            if (text && dbPrefix) {
                const handled = await run({ prefix: dbPrefix, content: text, ctx, commands, api });
                if (handled) return;
            }
        } catch {}
    };
}


