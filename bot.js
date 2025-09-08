const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment");

const token = "7794861572:AAGZ_bzHuQlXhDTKBdSC95ynrGjVy8aCuaw";
const bot = new TelegramBot(token, { polling: true });

let workers = {}; // Store data per user

// Helper: Reset daily record at 12AM
function resetDaily(userId) {
  workers[userId] = {
    startTime: null,
    endTime: null,
    activities: [],
    breaks: {
      eat: [],
      wc: [],
      smoke: [],
      takeout: []
    }
  };
}

// Helper: Start activity
function startActivity(userId, type, limit, maxTimes) {
  const user = workers[userId];
  const today = moment().format("YYYY-MM-DD");

  if (!user) resetDaily(userId);

  // Count used
  const used = workers[userId].breaks[type].length;

  if (used >= maxTimes) {
    return `❌ You already used ${type.toUpperCase()} ${maxTimes} times today.`;
  }

  workers[userId].activities.push({ type, start: moment(), end: null, limit });
  workers[userId].breaks[type].push({ start: moment(), end: null });

  return `✅ ${type.toUpperCase()} started. Allowed time: ${limit} min.`;
}

// Helper: Back to seat
function backToSeat(userId) {
  const user = workers[userId];
  if (!user || user.activities.length === 0) {
    return "⚠️ You have no activity yet!";
  }

  let last = user.activities[user.activities.length - 1];
  if (last.end) {
    return "⚠️ Last activity already ended. Start a new one.";
  }

  last.end = moment();

  // Get duration
  const duration = moment.duration(last.end.diff(last.start));
  const minutes = Math.floor(duration.asMinutes());
  const seconds = duration.seconds();

  // Limit check
  let msg = `🔙 Back to seat. Activity: ${last.type.toUpperCase()} lasted ${minutes}m ${seconds}s.`;
  if (minutes * 60 + seconds > last.limit * 60) {
    msg += ` ⚠️ You are late by ${minutes - last.limit}m ${seconds}s.`;
  } else {
    msg += " ✅ On time!";
  }

  return msg;
}

// 🟢 START WORK
bot.onText(/\/startwork/, (msg) => {
  const chatId = msg.chat.id;
  const now = moment();
  if (!workers[chatId]) resetDaily(chatId);

  workers[chatId].startTime = now;

  const scheduled = moment().hour(16).minute(0).second(0);
  let diff = now.diff(scheduled, "minutes");

  if (diff > 0) {
    bot.sendMessage(chatId, `⏰ You are late by ${diff} minutes!`);
  } else {
    bot.sendMessage(chatId, "✅ Work started on time at 4PM.");
  }
});

// 🔴 OFF WORK
bot.onText(/\/offwork/, (msg) => {
  const chatId = msg.chat.id;
  const user = workers[chatId];
  if (!user || !user.startTime) {
    return bot.sendMessage(chatId, "⚠️ You have not started work today.");
  }

  user.endTime = moment();
  const duration = moment.duration(user.endTime.diff(user.startTime));
  const hours = Math.floor(duration.asHours());
  const minutes = duration.minutes();

  let summary = `📊 Work Summary:\n🕒 Total Worked: ${hours}h ${minutes}m\n\n`;

  let activityCounts = {};
  user.activities.forEach((a) => {
    activityCounts[a.type] = (activityCounts[a.type] || 0) + 1;
  });

  for (let [act, count] of Object.entries(activityCounts)) {
    summary += `- ${act.toUpperCase()}: (${count})\n`;
  }

  bot.sendMessage(chatId, summary);
});

// 🍽 EAT (2 times, 30 min)
bot.onText(/\/eat/, (msg) => {
  bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "eat", 30, 2));
});

// 🚽 WC (6 times, 10 min)
bot.onText(/\/wc/, (msg) => {
  bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "wc", 10, 6));
});

// 🚬 SMOKE (5 times, 5 min)
bot.onText(/\/smoke/, (msg) => {
  bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "smoke", 5, 5));
});

// 🚶 TAKEOUT (2 times, 5 min)
bot.onText(/\/takeout/, (msg) => {
  bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "takeout", 5, 2));
});

// 🔙 BACK TO SEAT
bot.onText(/\/backtoseat/, (msg) => {
  bot.sendMessage(msg.chat.id, backToSeat(msg.chat.id));
});
