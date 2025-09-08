const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment");

const token = "7794861572:AAGZ_bzHuQlXhDTKBdSC95ynrGjVy8aCuaw"; // Replace with your Bot Token
const url = "https://time-bot-i88p.onrender.com"; // Replace with your Render app URL
const port = process.env.PORT || 3000;

const bot = new TelegramBot(token, { webHook: { port } });
bot.setWebHook(`${url}/bot${token}`);

const app = express();
app.use(bodyParser.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

let workers = {}; // Per-user data

function resetDaily(userId) {
  workers[userId] = {
    started: false,
    startTime: null,
    endTime: null,
    currentActivity: null,
    activities: [],
    breaks: { eat: [], wc: [], smoke: [], takeout: [] }
  };
}

function ensureUser(userId) {
  if (!workers[userId]) resetDaily(userId);
  return workers[userId];
}

function startActivity(userId, type, limit, maxTimes) {
  const user = ensureUser(userId);

  if (!user.started) return "⚠️ Please start work first with /startwork.";

  if (user.currentActivity) {
    return `⚠️ You are already in activity: ${user.currentActivity.type.toUpperCase()}. Please /backtoseat first.`;
  }

  const used = user.breaks[type].length;
  if (used >= maxTimes) return `❌ ${type.toUpperCase()} limit reached for today.`;

  const activity = { type, start: moment(), end: null, limit };
  user.currentActivity = activity;
  user.activities.push(activity);
  user.breaks[type].push(activity);

  return `✅ ${type.toUpperCase()} started. Limit: ${limit} min.`;
}

function backToSeat(userId) {
  const user = ensureUser(userId);

  if (!user.currentActivity) {
    return "⚠️ No ongoing activity. Start one first.";
  }

  user.currentActivity.end = moment();
  const duration = moment.duration(user.currentActivity.end.diff(user.currentActivity.start));
  const minutes = Math.floor(duration.asMinutes());
  const seconds = duration.seconds();

  let msg = `🔙 Back to seat. ${user.currentActivity.type.toUpperCase()} lasted ${minutes}m ${seconds}s.`;
  if (minutes * 60 + seconds > user.currentActivity.limit * 60) {
    msg += ` ⚠️ Late by ${minutes - user.currentActivity.limit}m ${seconds}s.`;
  } else {
    msg += " ✅ On time!";
  }

  user.currentActivity = null;
  return msg;
}

// /startwork
bot.onText(/\/startwork/, (msg) => {
  const chatId = msg.chat.id;
  const user = ensureUser(chatId);

  const now = moment();
  user.started = true;
  user.startTime = now;

  const scheduled = moment().hour(16).minute(0).second(0);
  let diff = now.diff(scheduled, "minutes");

  if (diff > 0) {
    bot.sendMessage(chatId, `⏰ Work started, but you are late by ${diff} minutes!`);
  } else {
    bot.sendMessage(chatId, "✅ Work started on time.");
  }
});

// /offwork
bot.onText(/\/offwork/, (msg) => {
  const chatId = msg.chat.id;
  const user = ensureUser(chatId);

  if (!user.started) return bot.sendMessage(chatId, "⚠️ You haven't started work today.");

  user.endTime = moment();
  const duration = moment.duration(user.endTime.diff(user.startTime));
  const hours = Math.floor(duration.asHours());
  const minutes = duration.minutes();

  let summary = `📊 Work Summary:\n🕒 Worked: ${hours}h ${minutes}m\n\n`;
  let activityCounts = {};
  user.activities.forEach((a) => {
    activityCounts[a.type] = (activityCounts[a.type] || 0) + 1;
  });

  for (let [act, count] of Object.entries(activityCounts)) {
    summary += `- ${act.toUpperCase()}: (${count})\n`;
  }

  bot.sendMessage(chatId, summary);
});

// Activities
bot.onText(/\/eat/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "eat", 30, 2)));
bot.onText(/\/wc/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "wc", 10, 6)));
bot.onText(/\/smoke/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "smoke", 5, 5)));
bot.onText(/\/takeout/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.chat.id, "takeout", 5, 2)));

// Back to seat
bot.onText(/\/backtoseat/, (msg) => bot.sendMessage(msg.chat.id, backToSeat(msg.chat.id)));

app.get("/", (req, res) => res.send("Bot is running..."));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

