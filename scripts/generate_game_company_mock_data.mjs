import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUTPUT_DIR = resolve('projects/game-company-mock-data/inputs');
const SEED = 20260716;
const START_DATE = '2026-03-18';
const DAYS = 120;

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const pad = (value, length = 2) => String(value).padStart(length, '0');
const round = (value, digits = 2) => Number(value.toFixed(digits));
const pick = (items) => items[Math.floor(random() * items.length)];
const weighted = (entries) => {
  const point = random();
  let total = 0;
  for (const [value, weight] of entries) {
    total += weight;
    if (point < total) return value;
  }
  return entries.at(-1)[0];
};
const dateAt = (offset) => {
  const date = new Date(`${START_DATE}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const timestampAt = (offset) => `${dateAt(offset)}T${pad(Math.floor(random() * 24))}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}+08:00`;

const channels = ['应用商店', '短视频', '信息流', '自然量', '社区合作'];
const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0'];
const regions = ['华东', '华南', '华北', '西南', '华中', '东北', '西北'];
const devices = ['Android', 'iOS'];
const ageBands = ['18岁以下', '18-24岁', '25-34岁', '35-44岁', '45岁以上'];

const players = Array.from({ length: 1200 }, (_, index) => {
  const registrationOffset = Math.floor(random() * 90);
  const channel = weighted(channels.map((item, i) => [item, [0.24, 0.21, 0.18, 0.25, 0.12][i]]));
  const firstVersion = versions[Math.min(versions.length - 1, Math.floor(registrationOffset / 30))];
  const lifecycle = weighted([['活跃', 0.48], ['新用户', 0.12], ['沉默', 0.18], ['回流', 0.1], ['流失', 0.12]]);
  return {
    player_id: `P${pad(index + 1, 6)}`,
    registration_date: dateAt(registrationOffset),
    channel,
    region: weighted(regions.map((item, i) => [item, [0.27, 0.18, 0.17, 0.13, 0.12, 0.08, 0.05][i]])),
    device_os: weighted([['Android', 0.68], ['iOS', 0.32]]),
    first_version: firstVersion,
    current_version: versions[Math.max(versions.indexOf(firstVersion), weighted([[1, 0.18], [2, 0.34], [3, 0.48]]))],
    age_band: weighted(ageBands.map((item, i) => [item, [0.06, 0.31, 0.39, 0.18, 0.06][i]])),
    is_new_player: registrationOffset >= DAYS - 30,
    lifecycle_status: lifecycle,
  };
});

const registrationOffsetByPlayer = new Map(players.map((player) => [player.player_id, Math.round((new Date(player.registration_date) - new Date(START_DATE)) / 86400000)]));
const activityWeight = { 活跃: 6, 新用户: 4, 沉默: 1.3, 回流: 2.8, 流失: 0.5 };
const playerPool = players.flatMap((player) => Array(Math.ceil(activityWeight[player.lifecycle_status] * 2)).fill(player));
const levelIds = Array.from({ length: 20 }, (_, index) => `L${pad(index + 1, 2)}`);
const eventTypes = [['登录', 0.22], ['会话开始', 0.14], ['关卡开始', 0.27], ['关卡完成', 0.2], ['关卡失败', 0.12], ['活动参与', 0.05]];

const playerEvents = Array.from({ length: 15000 }, (_, index) => {
  const player = pick(playerPool);
  const registrationOffset = registrationOffsetByPlayer.get(player.player_id);
  let dayOffset = registrationOffset + Math.floor(random() * (DAYS - registrationOffset));
  if (dayOffset >= 83 && dayOffset <= 89 && random() < 0.35) dayOffset = 86 + Math.floor(random() * 4);
  const eventType = weighted(eventTypes);
  const isLevelEvent = eventType.startsWith('关卡');
  let levelId = isLevelEvent ? pick(levelIds) : '';
  if (isLevelEvent && dayOffset >= 60 && dayOffset <= 78 && random() < 0.24) levelId = 'L12';
  const levelResult = eventType === '关卡完成' ? '完成' : eventType === '关卡失败' ? '失败' : eventType === '关卡开始' ? '进行中' : '';
  return {
    event_id: `EVT-${dateAt(dayOffset).replaceAll('-', '')}-${pad(index + 1, 6)}`,
    player_id: player.player_id,
    event_time: timestampAt(dayOffset),
    event_type: eventType,
    session_id: `SES-${player.player_id.slice(1)}-${pad(Math.floor(index / 3) + 1, 6)}`,
    level_id: levelId,
    level_result: levelResult,
    duration_seconds: eventType === '登录' ? 0 : Math.floor(20 + random() * (isLevelEvent ? 900 : 1800)),
    version: player.current_version,
    channel: player.channel,
    device_os: player.device_os,
  };
}).sort((a, b) => a.event_time.localeCompare(b.event_time) || a.event_id.localeCompare(b.event_id));

const products = [
  ['月卡', '订阅', 30], ['战令', '通行证', 68], ['新手礼包', '礼包', 6], ['成长礼包', '礼包', 18],
  ['角色皮肤', '外观', 45], ['武器皮肤', '外观', 30], ['星钻小包', '虚拟货币', 6], ['星钻中包', '虚拟货币', 30],
  ['星钻大包', '虚拟货币', 98], ['限定补给', '抽卡', 168],
];
const payerPool = players.filter((player) => player.lifecycle_status !== '流失');
const paymentOrders = Array.from({ length: 2200 }, (_, index) => {
  const player = pick(payerPool);
  const registrationOffset = registrationOffsetByPlayer.get(player.player_id);
  let dayOffset = registrationOffset + Math.floor(random() * (DAYS - registrationOffset));
  if (dayOffset === 87 && random() < 0.65) dayOffset = 88;
  const [productName, productType, baseAmount] = pick(products);
  const status = weighted([['已支付', 0.9], ['退款', 0.05], ['关闭', 0.03], ['待支付', 0.02]]);
  return {
    order_id: `ORD-${dateAt(dayOffset).replaceAll('-', '')}-${pad(index + 1, 6)}`,
    player_id: player.player_id,
    order_time: timestampAt(dayOffset),
    product_type: productType,
    product_name: productName,
    amount: round(baseAmount * pick([1, 1, 1, 1.5, 2])),
    currency: 'CNY',
    payment_status: status,
    is_first_purchase: false,
    channel: player.channel,
    version: player.current_version,
  };
}).sort((a, b) => a.order_time.localeCompare(b.order_time) || a.order_id.localeCompare(b.order_id));

const firstPaidPlayers = new Set();
for (const order of paymentOrders) {
  if (order.payment_status === '已支付' && !firstPaidPlayers.has(order.player_id)) {
    order.is_first_purchase = true;
    firstPaidPlayers.add(order.player_id);
  }
}

const campaignTypes = ['版本庆典', '新手召回', '限时副本', '充值返利'];
const campaigns = Array.from({ length: 12 }, (_, index) => {
  const startOffset = 4 + index * 9;
  const endOffset = Math.min(DAYS - 1, startOffset + 6);
  return {
    campaign_id: `CMP-2026-${pad(index + 1, 3)}`,
    campaign_name: `星港行动第${index + 1}期`,
    campaign_type: campaignTypes[index % campaignTypes.length],
    start_date: dateAt(startOffset),
    end_date: dateAt(endOffset),
    target_channel: channels[index % channels.length],
    target_version: versions[Math.min(versions.length - 1, Math.floor(index / 3))],
    budget: 50000 + index * 7500,
    target_new_players: 180 + index * 20,
    target_revenue: 70000 + index * 12000,
    status: endOffset < DAYS - 1 ? '已结束' : '进行中',
  };
});

const eventsByDate = new Map();
const paidOrdersByDate = new Map();
for (const event of playerEvents) {
  const date = event.event_time.slice(0, 10);
  if (!eventsByDate.has(date)) eventsByDate.set(date, []);
  eventsByDate.get(date).push(event);
}
for (const order of paymentOrders.filter((item) => item.payment_status === '已支付')) {
  const date = order.order_time.slice(0, 10);
  if (!paidOrdersByDate.has(date)) paidOrdersByDate.set(date, []);
  paidOrdersByDate.get(date).push(order);
}

const playersByRegistrationDate = new Map();
for (const player of players) {
  if (!playersByRegistrationDate.has(player.registration_date)) playersByRegistrationDate.set(player.registration_date, []);
  playersByRegistrationDate.get(player.registration_date).push(player);
}

const dailyMetrics = [];
for (let day = 0; day < DAYS; day += 1) {
  const metricDate = dateAt(day);
  for (const channel of channels) {
    for (const version of versions) {
      const dayEvents = (eventsByDate.get(metricDate) || []).filter((item) => item.channel === channel && item.version === version);
      const activePlayers = new Set(dayEvents.map((item) => item.player_id));
      const rollingPlayers = new Set();
      for (let lookback = Math.max(0, day - 29); lookback <= day; lookback += 1) {
        for (const event of eventsByDate.get(dateAt(lookback)) || []) {
          if (event.channel === channel && event.version === version) rollingPlayers.add(event.player_id);
        }
      }
      const orders = (paidOrdersByDate.get(metricDate) || []).filter((item) => item.channel === channel && item.version === version);
      const payingPlayers = new Set(orders.map((item) => item.player_id));
      const revenue = orders.reduce((sum, item) => sum + item.amount, 0);
      const levelStarts = dayEvents.filter((item) => item.event_type === '关卡开始').length;
      const levelCompletes = dayEvents.filter((item) => item.event_type === '关卡完成').length;
      const durations = dayEvents.filter((item) => item.duration_seconds > 0).map((item) => item.duration_seconds);
      const retention = (lag) => {
        if (day < lag) return 0;
        const cohort = (playersByRegistrationDate.get(dateAt(day - lag)) || []).filter((item) => item.channel === channel && item.current_version === version);
        if (!cohort.length) return 0;
        return cohort.filter((item) => activePlayers.has(item.player_id)).length / cohort.length;
      };
      dailyMetrics.push({
        metric_id: `MET-${metricDate.replaceAll('-', '')}-CH${pad(channels.indexOf(channel) + 1)}-V${pad(versions.indexOf(version) + 1)}`,
        metric_date: metricDate,
        channel,
        version,
        dau: activePlayers.size,
        mau: rollingPlayers.size,
        d1_retention_rate: round(retention(1), 4),
        d7_retention_rate: round(retention(7), 4),
        paying_players: payingPlayers.size,
        payment_rate: activePlayers.size ? round(payingPlayers.size / activePlayers.size, 4) : 0,
        revenue: round(revenue),
        arpu: activePlayers.size ? round(revenue / activePlayers.size) : 0,
        arppu: payingPlayers.size ? round(revenue / payingPlayers.size) : 0,
        average_session_seconds: durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
        level_completion_rate: levelStarts ? round(levelCompletes / levelStarts, 4) : 0,
        data_kind: 'actual',
      });
    }
  }
}

const dailyTotals = Array.from({ length: DAYS }, (_, day) => {
  const date = dateAt(day);
  const rows = dailyMetrics.filter((item) => item.metric_date === date);
  return {
    date,
    dau: rows.reduce((sum, item) => sum + item.dau, 0),
    revenue: round(rows.reduce((sum, item) => sum + item.revenue, 0)),
  };
});

const metricForecasts = [];
const scenarios = [['基准', 1], ['乐观', 1.15], ['保守', 0.85]];
for (const metricName of ['DAU', '收入']) {
  const field = metricName === 'DAU' ? 'dau' : 'revenue';
  const recent = dailyTotals.slice(-28).map((item) => item[field]);
  const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const priorAverage = dailyTotals.slice(-56, -28).reduce((sum, item) => sum + item[field], 0) / 28;
  const dailyTrend = (recentAverage - priorAverage) / 28;
  for (let horizon = 1; horizon <= 30; horizon += 1) {
    const weekdayFactor = [0.92, 0.94, 0.97, 1, 1.05, 1.16, 1.12][(DAYS + horizon - 1) % 7];
    const baseline = Math.max(0, (recentAverage + dailyTrend * horizon) * weekdayFactor);
    for (const [scenario, multiplier] of scenarios) {
      const forecastValue = baseline * multiplier;
      metricForecasts.push({
        forecast_id: `FC-20260716-${metricName === 'DAU' ? 'DAU' : 'REV'}-${pad(horizon, 2)}-${scenario}`,
        forecast_batch: 'FCB-20260716-001',
        forecast_date: dateAt(DAYS - 1 + horizon),
        metric_name: metricName,
        scenario,
        forecast_value: round(forecastValue),
        lower_bound: round(forecastValue * 0.82),
        upper_bound: round(forecastValue * 1.18),
        training_cutoff_date: dateAt(DAYS - 1),
        model_type: 'Mock季节趋势回归',
        data_kind: 'mock_forecast',
      });
    }
  }
}

const datasets = {
  players: { players },
  player_events: { player_events: playerEvents },
  payment_orders: { payment_orders: paymentOrders },
  campaigns: { campaigns },
  daily_metrics: { daily_metrics: dailyMetrics },
  metric_forecasts: { metric_forecasts: metricForecasts },
};

await mkdir(OUTPUT_DIR, { recursive: true });
for (const [name, data] of Object.entries(datasets)) {
  await writeFile(resolve(OUTPUT_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const summary = Object.fromEntries(Object.entries(datasets).map(([name, value]) => [name, Object.values(value)[0].length]));
await writeFile(resolve(OUTPUT_DIR, 'generation-summary.json'), `${JSON.stringify({ seed: SEED, startDate: START_DATE, days: DAYS, rows: summary }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
