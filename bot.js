require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
const axios = require("axios");

// ---------------- INITIALIZATION ----------------
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------- USER HISTORY ----------------
const userHistory = {};

// ---------------- EMERGENCY NUMBERS ----------------
function getEmergencyNumber(country = "GH") {
  const map = {
    GH: "112",
    US: "911",
    CA: "911",
    NG: "112",
    KE: "999",
    UK: "999",
    EU: "112"
  };
  return map[country] || "112";
}

// ---------------- SEVERITY SCORING ----------------
function calculateSeverity(text) {
  let score = 2;
  if (/pain|fever|vomit|dizzy/i.test(text)) score += 2;
  if (/severe|bleeding|breathing|chest/i.test(text)) score += 4;
  if (/unconscious|seizure|collapse/i.test(text)) score += 6;
  return Math.min(score, 10);
}
function isEmergency(severity) {
  return severity >= 8;
}

// ---------------- SAFE MEDICATION GUIDANCE ----------------
function medicationAdvice(text) {
  if (/headache|fever/i.test(text)) {
    return "💊 *Possible relief:* Paracetamol (Acetaminophen)\n⚠️ Do not exceed recommended dose. Avoid if allergic.";
  }
  if (/stomach|abdominal|diarrhea/i.test(text)) {
    return "💊 *Possible relief:* Oral rehydration solution or antacids.\n⚠️ Avoid NSAIDs.";
  }
  return "💊 Medication depends on condition. Consult a healthcare professional.";
}

// ---------------- EMERGENCY INLINE BUTTON ----------------
function emergencyInlineButton(country) {
  const number = getEmergencyNumber(country);
  return {
    inline_keyboard: [
      [{ text: "🚑 Call Emergency Now", url: `tel:${number}` }],
      [{ text: "📍 Share Location (Find Hospitals)", request_location: true }]
    ]
  };
}

// ---------------- START COMMAND ----------------
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 *Hey, how are you doing?*

This is *PulseX* — an AI healthcare assistant.

👨‍💻 *Developed by:*
Alexander Piasa Asiamah  
Gideon Appianing  

⚠️ PulseX does NOT replace a doctor.

💬 Tell me what you're feeling.`,
    { parse_mode: "Markdown" }
  );
});

// ---------------- LOCATION → HOSPITAL MAPS ----------------
bot.on("location", (msg) => {
  const { latitude, longitude } = msg.location;
  const mapUrl = `https://www.google.com/maps/search/hospital/@${latitude},${longitude},14z`;

  bot.sendMessage(
    msg.chat.id,
    "🏥 *Nearby Hospitals*",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🗺️ Open Hospital Map", url: mapUrl }]] }
    }
  );
});

// ---------------- VOICE INPUT ----------------
bot.on("voice", (msg) => {
  const country = msg.from.language_code?.toUpperCase() || "GH";
  bot.sendMessage(
    msg.chat.id,
    "🎙️ *Voice message received.*\n\nIf this is urgent, tap below immediately:",
    { parse_mode: "Markdown", reply_markup: emergencyInlineButton(country) }
  );
});

// ---------------- IMAGE INPUT ----------------
bot.on("photo", (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🖼️ *Image received.*\n\nI’ll check for visible symptoms like rash, swelling, or wounds.\n⚠️ Images alone may not be enough for diagnosis.",
    { parse_mode: "Markdown" }
  );
});

// ---------------- MAIN MESSAGE HANDLER ----------------
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const text = msg.text;
  const country = msg.from.language_code?.toUpperCase() || "GH";

  // Severity & history
  const severity = calculateSeverity(text);
  userHistory[chatId] = userHistory[chatId] || [];
  userHistory[chatId].push({ text, severity, time: new Date().toISOString() });

  // Emergency flow
  if (isEmergency(severity)) {
    bot.sendMessage(
      chatId,
      `🚨 *MEDICAL EMERGENCY DETECTED*

📊 Severity: *${severity}/10*

⛔ Do NOT wait.
📞 Call emergency services immediately.`,
      { parse_mode: "Markdown", reply_markup: emergencyInlineButton(country) }
    );
    return;
  }

  // AI RESPONSE
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are PulseX, an AI healthcare assistant. Never diagnose. Ask questions, assess severity, give safe advice." },
        { role: "user", content: text }
      ]
    });

    bot.sendMessage(
      chatId,
      `${completion.choices[0].message.content}

📊 *Severity:* ${severity}/10

${medicationAdvice(text)}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    bot.sendMessage(chatId, "⚠️ I’m having trouble responding. If urgent, contact a healthcare professional immediately.");
  }
});
