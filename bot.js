// =====================
// Full bot.js for live Telegram worker bot
// with formatted output
// =====================

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment");

// ======== CONFIGURATION ========
const token = "7794861572:AAGZ_bzHuQlXhDTKBdSC95ynrGjVy8aCuaw"; // Replace with your Telegram Bot token
const url = "https://time-bot-i88p.onrender.com"; // Replace with your Render app URL
const port = process.env.PORT || 3000;

// ======== EXPRESS SERVER ========
const app = express();
app.use(express.json());

// ======== TELEGRAM BOT (Webhook mode) ========
const bot = new TelegramBot(token);
bot.setWebHook(`${url}/bot${token}`);

// Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check endpoint
app.get("/", (req, res) => res.send("✅ Bot is live and running..."));

// ======== WORKERS DATA ========
let workers = {}; // Stores per-user daily info

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

// ======== HELPER FUNCTIONS ========
function formatTimeShort(time) {
  return moment(time).format("DD/MM/YYYY HH:mm");
}

function startActivity(user, type, limit, maxTimes) {
  const userData = ensureUser(user.id);

  if (!userData.started) return "⚠️ Please start work first with /startwork.";

  if (userData.currentActivity) {
    return `⚠️ You are already in activity: ${userData.currentActivity.type.toUpperCase()}. Please /backtoseat first.`;
  }

  const used = userData.breaks[type].length;
  if (used >= maxTimes) return `❌ ${type.toUpperCase()} limit reached for today.`;

  const activity = { type, start: moment(), end: null, limit };
  userData.currentActivity = activity;
  userData.activities.push(activity);
  userData.breaks[type].push(activity);

  let output = `Name: ${user.first_name || "Unknown"}\n`;
  output += `Chat ID: ${user.id}\n`;
  output += `Activity: ${type.toUpperCase()} started\n`;
  output += `Duration: ${limit} minutes\n`;
  output += `Note:\n`; // Empty as started
  output += `Check In Time: ${formatTimeShort(activity.start)}`;

  return output;
}

function backToSeat(user) {
  const userData = ensureUser(user.id);

  if (!userData.currentActivity) {
    return "⚠️ No ongoing activity. Start one first.";
  }

  userData.currentActivity.end = moment();
  const duration = moment.duration(userData.currentActivity.end.diff(userData.currentActivity.start));
  const minutes = Math.floor(duration.asMinutes());
  const seconds = duration.seconds();

  let note = "";
  if (minutes * 60 + seconds > userData.currentActivity.limit * 60) {
    note = `⚠️ Late by ${minutes - userData.currentActivity.limit}m ${seconds}s`;
  }

  let output = `Name: ${user.first_name || "Unknown"}\n`;
  output += `Chat ID: ${user.id}\n`;
  output += `Activity: ${userData.currentActivity.type.toUpperCase()} completed\n`;
  output += `Duration: ${minutes}m ${seconds}s\n`;
  output += `Note: ${note}\n`;
  output += `Check In Time: ${formatTimeShort(userData.currentActivity.start)}`;

  userData.currentActivity = null;
  return output;
}

function startWorkMessage(user) {
  const userData = ensureUser(user.id);
  const now = moment.utc(); // use UTC time
  userData.started = true;
  userData.startTime = now;

  // Scheduled work start is always 16:00 UTC
  const scheduled = moment.utc().hour(16).minute(0).second(0);

  let diffSeconds = now.diff(scheduled, 'seconds');
  let note = "";

  if (diffSeconds > 0) {
    const minutesLate = Math.floor(diffSeconds / 60);
    const secondsLate = diffSeconds % 60;
    note = `⚠️ You are late by ${minutesLate}m ${secondsLate}s`;
  }

  let output = `Name: ${user.first_name || "Unknown"}\n`;
  output += `Chat ID: ${user.id}\n`;
  output += `Activity: Start work successfully\n`;
  output += `Note: ${note}\n`;
  output += `Check In Time: ${formatTimeShort(now)}`;

  return output;
}

function offWorkMessage(user) {
  const userData = ensureUser(user.id);
  userData.endTime = moment();

  const totalDuration = moment.duration(userData.endTime.diff(userData.startTime));
  const hours = Math.floor(totalDuration.asHours());
  const minutes = totalDuration.minutes();
  const seconds = totalDuration.seconds();

  let activitiesSummary = "";
  userData.activities.forEach((a) => {
    const dur = a.end ? moment.duration(a.end.diff(a.start)) : moment.duration(0);
    activitiesSummary += `- ${a.type.toUpperCase()}: ${Math.floor(dur.asMinutes())}m ${dur.seconds()}s\n`;
  });

  let output = `Name: ${user.first_name || "Unknown"}\n`;
  output += `Chat ID: ${user.id}\n`;
  output += `Activity: Off work successfully\n`;
  output += `Total work hours: ${hours}h ${minutes}m ${seconds}s\n`;
  output += `Today Activities:\n${activitiesSummary || "None"}\n`;
  output += `Check In Time: ${formatTimeShort(userData.startTime)}`;

  return output;
}

// ======== TELEGRAM COMMANDS ========

// /startwork
// /startwork
bot.onText(/\/startwork/, (msg) => {
  const chatId = msg.chat.id;
  const userData = ensureUser(msg.from.id);

  // Check if work already started
  if (userData.started) {
    const warning = `⚠️ You have already started work today. Please press /offwork before starting again.`;
    return bot.sendMessage(chatId, warning);
  }

  // Use UTC 4PM as work start reference
  const now = moment.utc();
  userData.started = true;
  userData.startTime = now;

  const scheduled = moment.utc().hour(16).minute(0).second(0);
  let diffSeconds = now.diff(scheduled, 'seconds');
  let note = "";

  if (diffSeconds > 0) {
    const minutesLate = Math.floor(diffSeconds / 60);
    const secondsLate = diffSeconds % 60;
    note = `⚠️ You are late by ${minutesLate}m ${secondsLate}s`;
  }

  let output = `Name: ${msg.from.first_name || "Unknown"}\n`;
  output += `Chat ID: ${msg.from.id}\n`;
  output += `Activity: Start work successfully\n`;
  output += `Note: ${note}\n`;
  output += `Check In Time: ${formatTimeShort(now)}`;

  bot.sendMessage(chatId, output);
});

// Activities
bot.onText(/\/eat/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.from, "eat", 30, 2)));
bot.onText(/\/wc/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.from, "wc", 10, 6)));
bot.onText(/\/smoke/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.from, "smoke", 5, 5)));
bot.onText(/\/takeout/, (msg) => bot.sendMessage(msg.chat.id, startActivity(msg.from, "takeout", 5, 2)));

// /backtoseat
bot.onText(/\/backtoseat/, (msg) => bot.sendMessage(msg.chat.id, backToSeat(msg.from)));

// ======== START EXPRESS SERVER ========
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});


