const axios = require("axios");

const STAT_LABELS = {
  hp: "HP",
  attack: "Atk",
  defense: "Def",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed"
};

module.exports.config = {
  name: "pokemon",
  aliases: ["pokedex", "poke"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tra cứu thông tin Pokémon từ PokeAPI",
  category: "Tiện ích",
  usage: "pokemon <tên hoặc id>",
  cooldowns: 5,
  dependencies: { axios: "" }
};

function normalizeQuery(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, "")
    .replace(/\s+/g, "-");
}

function padId(id) {
  if (typeof id !== "number") return "?";
  return String(id).padStart(4, "0");
}

function formatHeight(height) {
  if (typeof height !== "number") return "Không rõ";
  const meters = height / 10;
  return `${meters.toFixed(1)} m`;
}

function formatWeight(weight) {
  if (typeof weight !== "number") return "Không rõ";
  const kilograms = weight / 10;
  return `${kilograms.toFixed(1)} kg`;
}

function formatTypes(types = []) {
  if (!Array.isArray(types) || types.length === 0) return "Không rõ";
  return types
    .map((entry) => entry?.type?.name)
    .filter(Boolean)
    .map(capitalize)
    .join(", ");
}

function formatAbilities(abilities = []) {
  if (!Array.isArray(abilities) || abilities.length === 0) return "Không rõ";
  return abilities
    .map((entry) => {
      if (!entry?.ability?.name) return null;
      const name = capitalize(entry.ability.name);
      return entry.is_hidden ? `${name} (Ẩn)` : name;
    })
    .filter(Boolean)
    .join(", ");
}

function formatStats(stats = []) {
  if (!Array.isArray(stats) || stats.length === 0) {
    return "   • Không có dữ liệu";
  }

  return stats
    .map((entry) => {
      const base = typeof entry?.base_stat === "number" ? entry.base_stat : "?";
      const key = entry?.stat?.name || "";
      const label = STAT_LABELS[key] || capitalize(key.replace(/-/g, " "));
      return `   • ${label}: ${base}`;
    })
    .join("\n");
}

function capitalize(text = "") {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(/\s|-/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}


module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;

  if (!Array.isArray(args) || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập tên hoặc mã số Pokémon. Ví dụ: pokemon pikachu", threadId, type);
  }

  const rawQuery = args.join(" ");
  const query = normalizeQuery(rawQuery);

  if (!query) {
    return api.sendMessage("❌ Tên Pokémon không hợp lệ.", threadId, type);
  }

  const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url, { timeout: 10000 });
    const pokemon = response?.data;

    if (!pokemon) {
      return api.sendMessage(`❌ Không tìm thấy Pokémon "${rawQuery}".`, threadId, type);
    }

    const header = `🧿 Pokémon: ${capitalize(pokemon.name)} (#${padId(pokemon.id)})`;
    const lines = [
      header,
      `📏 Chiều cao: ${formatHeight(pokemon.height)} · ⚖️ Khối lượng: ${formatWeight(pokemon.weight)}`,
      `🔥 Hệ: ${formatTypes(pokemon.types)}`,
      `🧬 Khả năng: ${formatAbilities(pokemon.abilities)}`,
      typeof pokemon.base_experience === "number" ? `🎯 Base XP: ${pokemon.base_experience}` : null,
      Array.isArray(pokemon.moves) ? `🎓 Số chiêu học được: ${pokemon.moves.length}` : null,
      `⭐ Chỉ số cơ bản:\n${formatStats(pokemon.stats)}`
    ].filter(Boolean);

    const message = lines.join("\n");
    await api.sendMessage(message, threadId, type);
  } catch (error) {
    if (error?.response?.status === 404) {
      return api.sendMessage(`❌ Không tìm thấy Pokémon "${rawQuery}".`, threadId, type);
    }

    console.error("[pokemon] Lỗi gọi PokeAPI:", error?.response?.data || error?.message || error);
    return api.sendMessage(
      "❌ Không thể tra cứu Pokémon lúc này. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
};
