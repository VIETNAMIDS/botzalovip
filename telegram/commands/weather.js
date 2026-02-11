const chatPrefs = require('../state/chatPrefs');
const { fetchJson } = require('../services/fetchJson');

async function geocodeLocation(query) {
  const endpoint = 'https://geocoding-api.open-meteo.com/v1/search';
  const url = `${endpoint}?name=${encodeURIComponent(query)}&count=1&language=vi&format=json`;
  const data = await fetchJson(url);
  if (!data?.results?.length) {
    throw new Error('Không tìm thấy địa điểm. Thử nhập rõ hơn (ví dụ: "Đà Nẵng, Việt Nam").');
  }
  const place = data.results[0];
  return {
    name: place.name,
    admin1: place.admin1,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
    population: place.population,
  };
}

function formatPlaceLabel(place) {
  const parts = [place.name];
  if (place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
  if (place.country) parts.push(place.country);
  return parts.join(', ');
}

async function resolveLocation(ctx, args = []) {
  const query = args.join(' ').trim();
  if (query) {
    const place = await geocodeLocation(query);
    chatPrefs.update(ctx.chat.id, { lastLocation: place, lastCoords: { lat: place.latitude, lon: place.longitude } });
    return place;
  }
  const prefs = chatPrefs.get(ctx.chat.id);
  if (prefs.lastLocation) {
    return prefs.lastLocation;
  }
  throw new Error('Chưa có địa điểm. Vui lòng gõ /weather <tên thành phố>.');
}

function buildCurrentWeatherText(place, weather) {
  const lines = [
    `🌤️ Thời tiết hiện tại tại ${formatPlaceLabel(place)}`,
    `🌡️ Nhiệt độ: ${weather.temperature}°C (cảm giác: ${weather.apparent_temperature}°C)`,
    `💧 Độ ẩm: ${weather.relativehumidity_2m}%`,
    `🌬️ Gió: ${weather.windspeed} km/h`,
    `🧭 Hướng gió: ${weather.winddirection}°`,
    weather.weathercode !== undefined ? `☁️ Mã mây: ${weather.weathercode}` : null,
    `🕓 Cập nhật: ${weather.time}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function fetchWeatherData(place) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,apparent_temperature,weathercode&timezone=${encodeURIComponent(place.timezone)}`;
  const data = await fetchJson(url);
  if (!data?.current_weather || !data?.hourly) {
    throw new Error('Không lấy được dữ liệu thời tiết.');
  }
  const idx = data.hourly.time.indexOf(data.current_weather.time);
  const humidity = idx >= 0 ? data.hourly.relativehumidity_2m[idx] : null;
  const apparent = idx >= 0 ? data.hourly.apparent_temperature[idx] : data.current_weather.temperature;
  return {
    temperature: data.current_weather.temperature,
    windspeed: data.current_weather.windspeed,
    winddirection: data.current_weather.winddirection,
    relativehumidity_2m: humidity,
    apparent_temperature: apparent,
    time: data.current_weather.time,
    weathercode: data.current_weather.weathercode,
  };
}

async function fetchForecastData(place) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=${encodeURIComponent(place.timezone)}`;
  const data = await fetchJson(url);
  if (!data?.daily) {
    throw new Error('Không lấy được dự báo.');
  }
  return data.daily;
}

async function fetchSunData(place) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=sunrise,sunset,daylight_duration&timezone=${encodeURIComponent(place.timezone)}`;
  const data = await fetchJson(url);
  if (!data?.daily) throw new Error('Không lấy được dữ liệu mặt trời.');
  return data.daily;
}

async function fetchMoonData(place) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=moonrise,moonset,moon_phase&timezone=${encodeURIComponent(place.timezone)}`;
  const data = await fetchJson(url);
  if (!data?.daily) throw new Error('Không lấy được dữ liệu mặt trăng.');
  return data.daily;
}

async function fetchAirQuality(place) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&hourly=pm10,pm2_5,carbon_monoxide,ozone,nitrogen_dioxide,us_aqi&timezone=${encodeURIComponent(place.timezone)}`;
  const data = await fetchJson(url);
  if (!data?.hourly) throw new Error('Không lấy được dữ liệu chất lượng không khí.');
  const lastIndex = data.hourly.time.length - 1;
  return {
    time: data.hourly.time[lastIndex],
    pm10: data.hourly.pm10[lastIndex],
    pm2_5: data.hourly.pm2_5[lastIndex],
    carbon_monoxide: data.hourly.carbon_monoxide[lastIndex],
    ozone: data.hourly.ozone[lastIndex],
    nitrogen_dioxide: data.hourly.nitrogen_dioxide[lastIndex],
    us_aqi: data.hourly.us_aqi ? data.hourly.us_aqi[lastIndex] : null,
  };
}

function formatForecastText(place, daily) {
  const lines = [`📅 Dự báo 3 ngày tới tại ${formatPlaceLabel(place)}`];
  for (let i = 0; i < Math.min(3, daily.time.length); i++) {
    lines.push(
      `
📌 ${daily.time[i]}:
🌡️ Cao ${daily.temperature_2m_max[i]}°C / Thấp ${daily.temperature_2m_min[i]}°C
☔ Mưa: ${daily.precipitation_sum[i]} mm
💨 Gió: ${daily.windspeed_10m_max[i]} km/h`
    );
  }
  return lines.join('\n');
}

function formatAirQuality(place, air) {
  const lines = [
    `🌫️ Chất lượng không khí (${formatPlaceLabel(place)})`,
    `🕓 Thời gian: ${air.time}`,
    `🇺🇸 US AQI: ${air.us_aqi ?? 'n/a'}`,
    `PM10: ${air.pm10} µg/m³`,
    `PM2.5: ${air.pm2_5} µg/m³`,
    `CO: ${air.carbon_monoxide} µg/m³`,
    `O₃: ${air.ozone} µg/m³`,
    `NO₂: ${air.nitrogen_dioxide} µg/m³`,
  ];
  return lines.join('\n');
}

function formatSunText(place, sun) {
  return (
    `🌞 Mặt trời tại ${formatPlaceLabel(place)} (${sun.time[0]})\n` +
    `🌅 Bình minh: ${sun.sunrise[0]}\n` +
    `🌇 Hoàng hôn: ${sun.sunset[0]}\n` +
    `🕒 Thời lượng ngày: ${(sun.daylight_duration[0] / 3600).toFixed(2)} giờ`
  );
}

function formatMoonText(place, moon) {
  const phaseNames = {
    0: 'Trăng mới',
    0.25: 'Trăng đầu tuần',
    0.5: 'Trăng tròn',
    0.75: 'Trăng cuối tuần',
  };
  const rawPhase = moon.moon_phase[0];
  let closest = 'Giai đoạn khác';
  let minDiff = Infinity;
  for (const key of Object.keys(phaseNames)) {
    const diff = Math.abs(rawPhase - Number(key));
    if (diff < minDiff) {
      minDiff = diff;
      closest = phaseNames[key];
    }
  }
  return (
    `🌙 Mặt trăng tại ${formatPlaceLabel(place)} (${moon.time[0]})\n` +
    `🌝 Trạng thái: ${closest} (${rawPhase})\n` +
    `🌔 Mọc: ${moon.moonrise[0] || 'n/a'}\n` +
    `🌒 Lặn: ${moon.moonset[0] || 'n/a'}`
  );
}

module.exports = function buildWeatherCommands() {
  const commands = [];

  commands.push({
    name: 'weather',
    description: 'Xem thời tiết hiện tại (/weather <tỉnh/thành phố>)',
    category: 'Thời tiết',
    run: async ({ ctx, args }) => {
      const place = await resolveLocation(ctx, args);
      const weather = await fetchWeatherData(place);
      await ctx.reply(buildCurrentWeatherText(place, weather));
    },
  });

  commands.push({
    name: 'forecast',
    description: 'Dự báo 3 ngày tới (/forecast <địa điểm>)',
    category: 'Thời tiết',
    run: async ({ ctx, args }) => {
      const place = await resolveLocation(ctx, args);
      const daily = await fetchForecastData(place);
      await ctx.reply(formatForecastText(place, daily));
    },
  });

  commands.push({
    name: 'air',
    description: 'Chỉ số chất lượng không khí',
    category: 'Thời tiết',
    run: async ({ ctx, args }) => {
      const place = await resolveLocation(ctx, args);
      const air = await fetchAirQuality(place);
      await ctx.reply(formatAirQuality(place, air));
    },
  });

  commands.push({
    name: 'sunrise',
    description: 'Giờ bình minh/hoàng hôn',
    category: 'Thời tiết',
    run: async ({ ctx, args }) => {
      const place = await resolveLocation(ctx, args);
      const sun = await fetchSunData(place);
      await ctx.reply(formatSunText(place, sun));
    },
  });

  commands.push({
    name: 'moon',
    description: 'Thông tin mặt trăng',
    category: 'Thời tiết',
    run: async ({ ctx, args }) => {
      const place = await resolveLocation(ctx, args);
      const moon = await fetchMoonData(place);
      await ctx.reply(formatMoonText(place, moon));
    },
  });

  return commands;
};
