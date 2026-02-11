import { ListenMessage } from "./listen.message.js";
import { ListenReaction } from "./listen.reaction.js";
import { ListenUndo } from "./listen.undo.js";

export function listen(api, commands = null, prefix = "!") {
    ListenMessage(api, commands, prefix);
    ListenReaction(api);
    ListenUndo(api);
}