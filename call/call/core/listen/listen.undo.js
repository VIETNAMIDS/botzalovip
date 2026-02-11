/**
 * Lắng nghe và in ra dữ liệu của sự kiện thu hồi (undo).
 * Gọi hàm này sau khi đã đăng nhập và có đối tượng `api`.
 *
 * Ví dụ dùng:
 *   import { ListenUndo } from "./core/listen/listen.undo.js";
 *   ListenUndo(api);
 */
export const ListenUndo = (api) => {
    api.listener.on("undo", (undo) => {
        try {
            const isGroup = Boolean(undo?.isGroup);
            const typeLabel = isGroup ? "Group" : "User";
            const data = undo?.data || {};
            const displayName = data.dName || data.displayName || data.name || data.uidFrom || "(unknown)";
            const msgType = data.msgType || "chat.undo";
            const msgId = data.msgId || data.messageId || "";
            const cliMsgId = (data.content && (data.content.cliMsgId ?? data.content.clientMsgId)) || data.cliMsgId || "";
            const deleteFlag = (data.content && (data.content.deleteMsg ?? data.content.delete)) ?? undefined;
            let ts = data.ts || data.timestamp || data.time;
            if (typeof ts === "string" && /^\d+$/.test(ts)) ts = Number(ts);
            const timeStr = ts ? new Date(ts).toLocaleString("vi-VN") : new Date().toLocaleString("vi-VN");

            console.log(`User: ${displayName}\n`);
            console.log(`Type: ${msgType} | ${typeLabel}\n`);
            console.log(`Message: Undo | msgId=${msgId}${cliMsgId?` | originCliMsgId=${cliMsgId}`:""}${deleteFlag!=null?` | delete=${deleteFlag}`:""}\n`);
            console.log(`Time: ${timeStr}`);
            console.log("═══════════════════");
        } catch (e) {
            console.log(undo);
            console.log("═══════════════════");
        }
    });
};


