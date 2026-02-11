/**
 * Lắng nghe và in ra dữ liệu của cảm xúc (reaction).
 * Gọi hàm này sau khi đã đăng nhập và có đối tượng `api`.
 *
 * Ví dụ dùng:
 *   import { ListenReaction } from "./core/listen/listen.reaction.js";
 *   ListenReaction(api);
 */
const RTypeName = new Map([
    [0,  "HAHA"],
    [3,  "LIKE"],
    [5,  "HEART"],
    [32, "WOW"],
    [2,  "CRY"],
    [20, "ANGRY"],
    [8,  "KISS"],
    [7,  "TEARS_OF_JOY"],
    [66, "SHIT"],
    [120,"ROSE"],
    [65, "BROKEN_HEART"],
    [4,  "DISLIKE"],
    [29, "LOVE"],
    [51, "CONFUSED"],
    [45, "WINK"],
    [121,"FADE"],
    [67, "SUN"],
    [126,"BIRTHDAY"],
    [127,"BOMB"],
    [68, "OK"],
    [69, "PEACE"],
    [70, "THANKS"],
    [71, "PUNCH"],
    [72, "SHARE"],
    [73, "PRAY"],
    [131,"NO"],
    [132,"BAD"],
    [133,"LOVE_YOU"],
    [1,  "SAD"],
    [16, "VERY_SAD"],
    [21, "COOL"],
    [22, "NERD"],
    [23, "BIG_SMILE"],
    [26, "SUNGLASSES"],
    [30, "NEUTRAL"],
    [35, "SAD_FACE"],
    [36, "BYE"],
    [38, "SLEEPY"],
    [39, "WIPE"],
    [42, "DIG"],
    [44, "ANGUISH"],
    [46, "HANDCLAP"],
    [47, "ANGRY_FACE"],
    [48, "F_CHAIR"],
    [49, "L_CHAIR"],
    [50, "R_CHAIR"],
    [52, "SILENT"],
    [53, "SURPRISE"],
    [54, "EMBARRASSED"],
    [60, "AFRAID"],
    [61, "SAD2"],
    [62, "BIG_LAUGH"],
    [63, "RICH"],
    [99, "BEER"],
]);

export const ListenReaction = (api) => {
    api.listener.on("reaction", (reaction) => {
        try {
            const isGroup = Boolean(reaction?.isGroup);
            const typeLabel = isGroup ? "Group" : "User";
            const data = reaction?.data || {};

            const messageId = data.messageId || data.msgId || data.cliMsgId || "";
            const userId = data.userId || data.uid || data.uidFrom || reaction?.threadId || "";
            const rTypeRaw = [
                data.rType,
                data.reactionType,
                data.reactType,
                data?.content?.rType,
                data?.content?.reactionType,
            ].find(v => v !== undefined && v !== null);
            const rType = rTypeRaw != null ? Number(rTypeRaw) : null;
            const rName = (rType != null && RTypeName.has(rType))
                ? RTypeName.get(rType)
                : (data.emoji || data?.content?.emoji || "UNKNOWN");

            let ts = data.timestamp || data.ts || data.time;
            if (typeof ts === "string" && /^\d+$/.test(ts)) ts = Number(ts);
            const timeStr = ts ? new Date(ts).toLocaleString("vi-VN") : new Date().toLocaleString("vi-VN");

          //  console.log(`User: ${userId || "(unknown)"}\n`);
          //  console.log(`Type: reaction | ${typeLabel}\n`);
//             console.log(`Message: ${rName}${rType!=null?` (rType=${rType})`:''} | msgId=${messageId}\n`);
            if (rName === "UNKNOWN") {
                try { console.log("Raw:", JSON.stringify(data)); } catch {}
            }
        //    console.log(`Time: ${timeStr}`);
        //    console.log("═══════════════════");
        } catch (e) {
         //   console.log(reaction);
        //    console.log("═══════════════════");
        }
    });
};


