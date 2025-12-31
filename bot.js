// require("dotenv").config();
// const TelegramBot = require("node-telegram-bot-api");
// const OpenAI = require("openai");

// // Telegram bot
// const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// // OpenAI client (NEW way)
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// const userStates = {}; // conversation stage
// const userHistory = {}; // symptom memory

// bot.onText(/\/start/, (msg) => {
//   const chatId = msg.chat.id;

//   if (!userHistory[chatId]) userHistory[chatId] = [];
//   userStates[chatId] = { stage: "ask_symptoms", symptoms: [] };

//   let greeting =
//     "Hey, how are you doing?\n" +
//     "This is PulseX 🤖, created by Alexander Piasa Asiamah and Gideon Appianing.\n";

//   if (userHistory[chatId].length > 0) {
//     greeting += "I remember your past symptoms.\n";
//   }

//   greeting += "Please tell me your main symptom(s).";

//   bot.sendMessage(chatId, greeting);
// });

// bot.on("message", async (msg) => {
//   const chatId = msg.chat.id;
//   const text = msg.text;

//   if (!text || text.startsWith("/")) return;

//   if (!userStates[chatId]) {
//     bot.sendMessage(chatId, "Type /start to begin.");
//     return;
//   }

//   const state = userStates[chatId];

//   try {
//     if (state.stage === "ask_symptoms") {
//       state.symptoms.push(text);
//       state.stage = "ask_followup";

//       bot.sendMessage(
//         chatId,
//         "Can you describe any other symptoms? (duration, severity, etc.)"
//       );
//     } else if (state.stage === "ask_followup") {
//       state.symptoms.push(text);
//       state.stage = "predict";

//       userHistory[chatId].push(...state.symptoms);

//       bot.sendMessage(chatId, "Analyzing your symptoms...");

//       const prompt = `
// User symptom history: ${userHistory[chatId].join(", ")}.
// Suggest up to 3 possible causes with brief explanations.
//       `;

//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [
//           { role: "system", content: "You are a medical assistant." },
//           { role: "user", content: prompt },
//         ],
//         max_tokens: 400,
//       });

//       const prediction = response.choices[0].message.content;

//       bot.sendMessage(
//         chatId,
//         `${prediction}\n\n(Created by Alexander Piasa Asiamah and Gideon Appianing)`
//       );

//       delete userStates[chatId];
//     }
//   } catch (err) {
//     console.error(err);
//     bot.sendMessage(chatId, "Something went wrong. Please try again.");
//   }
// });


const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

// ========================
// CONFIG
// ========================
const TELEGRAM_TOKEN = "PASTE_YOUR_TELEGRAM_BOT_TOKEN";
const OPENAI_API_KEY = "PASTE_YOUR_OPENAI_API_KEY";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ========================
// AUTHORS
// ========================
const authors = "Alexander Piasa Asiamah & Gideon Appianing";

// ========================
// EMERGENCY NUMBERS
// ========================
const emergencyNumbers = {
  usa: { label: "🇺🇸 USA", number: "911" },
  canada: { label: "🇨🇦 Canada", number: "911" },
  europe: { label: "🇪🇺 Europe", number: "112" },
  asia: { label: "🌏 Asia", number: "112" },
  nigeria: { label: "🇳🇬 Nigeria", number: "112" },
  kenya: { label: "🇰🇪 Kenya", number: "999" },
  ghana: { label: "🇬🇭 Ghana", number: "112" },
  global: { label: "🌍 Global", number: "112" }
};

// ========================
// EMERGENCY SYMPTOMS
// ========================
const emergencySymptoms = [
  "chest_pain",
  "difficulty_breathing",
  "loss_of_consciousness",
  "severe_bleeding"
];

// ========================
// DETECT COUNTRY
// ========================
function detectCountry(msg) {
  const lang = msg.from.language_code || "";
  if (lang.includes("US")) return emergencyNumbers.usa;
  if (lang.includes("CA")) return emergencyNumbers.canada;
  if (lang.startsWith("fr") || lang.startsWith("de")) return emergencyNumbers.europe;
  if (lang.startsWith("sw")) return emergencyNumbers.kenya;
  return emergencyNumbers.global;
}

// ========================
// SEVERITY LEVELS
// ========================
function calculateSeverity(symptoms) {
  let score = 0;
  symptoms.forEach(s => {
    if (emergencySymptoms.includes(s)) score += 5;
    else score += 1;
  });
  if (score >= 7) return "🔴 Severe";
  if (score >= 4) return "🟠 Moderate";
  return "🟢 Mild";
}

// ========================
// HOSPITALS LINK
// ========================
function hospitalLink() {
  return "https://www.google.com/maps/search/nearest+hospital";
}

// ========================
// CONDITION PREDICTION LOGIC
// ========================
const conditions = [
  {
    name: "Malaria",
    symptoms: { fever: 3, headache: 2, chills: 3, sweating: 2, fatigue: 1 },
    drugs: ["Artemether-Lumefantrine"],
    advice: "Drink fluids and visit a hospital for a malaria test."
  },
  {
    name: "Typhoid Fever",
    symptoms: { fever: 3, stomach_pain: 2, diarrhea: 2, fatigue: 1 },
    drugs: ["Ciprofloxacin (doctor prescribed)"],
    advice: "Avoid street food and get a blood test."
  },
  {
    name: "Common Cold",
    symptoms: { sneezing: 2, runny_nose: 2, sore_throat: 1, headache: 1 },
    drugs: ["Paracetamol", "Vitamin C"],
    advice: "Rest well and stay hydrated."
  }
];

function predictCondition(userSymptoms) {
  if (userSymptoms.some(s => emergencySymptoms.includes(s))) {
    return { emergency: true, message: "🚨 Emergency detected!" };
  }

  let results = [];
  for (let cond of conditions) {
    let score = 0;
    userSymptoms.forEach(s => { if (cond.symptoms[s]) score += cond.symptoms[s]; });
    if (score > 0) results.push({ name: cond.name, score, drugs: cond.drugs, advice: cond.advice });
  }

  results.sort((a, b) => b.score - a.score);
  return { emergency: false, predictions: results.slice(0, 3) };
}

// ========================
// TELEGRAM HANDLERS
// ========================

// /start
bot.onText(/\/start/, (msg) => {
  const loc = detectCountry(msg);
  bot.sendMessage(
    msg.chat.id,
    `👋 Hello!\n🩺 PulseX Medical Assistant\n_By ${authors}_\n\n` +
    `🌍 Auto-detected region: ${loc.label}\nType your symptoms or send a voice message.`,
    { parse_mode: "Markdown" }
  );
});

// TEXT INPUT
bot.on("message", async (msg) => {
  if (!msg.text || msg.voice) return; // skip voice messages here

  const chatId = msg.chat.id;
  const symptoms = msg.text.toLowerCase().replace(/\s+/g, "_").split(",");
  const severity = calculateSeverity(symptoms);

  if (symptoms.some(s => emergencySymptoms.includes(s))) {
    const loc = detectCountry(msg);
    bot.sendMessage(chatId, "🚨 EMERGENCY DETECTED", {
      reply_markup: { inline_keyboard: [[{ text: `🚑 Call Ambulance (${loc.number})`, url: `tel:${loc.number}` }], [{ text: "🏥 Find Hospitals Nearby", url: hospitalLink() }]] }
    });
    return;
  }

  bot.sendMessage(
    chatId,
    `🧠 Assessment Complete\n📊 Severity: *${severity}*\n🏥 Nearby hospitals:\n${hospitalLink()}\n⚠️ Not a medical diagnosis.`,
    { parse_mode: "Markdown" }
  );
});

// VOICE INPUT + WHISPER AI TRANSCRIPTION
bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const file = await bot.getFile(msg.voice.file_id);
    const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;

    const response = await axios({ url, method: "GET", responseType: "stream" });
    const path = `voice_${chatId}.ogg`;
    const writer = fs.createWriteStream(path);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });

    const form = new FormData();
    form.append("file", fs.createReadStream(path));
    form.append("model", "whisper-1");

    const whisperRes = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() }
    });

    const transcription = whisperRes.data.text;
    bot.sendMessage(chatId, `🎤 Transcribed Text: "${transcription}"`);

    const symptoms = transcription.toLowerCase().replace(/\s+/g, "_").split(",");
    const severity = calculateSeverity(symptoms);

    if (symptoms.some(s => emergencySymptoms.includes(s))) {
      const loc = detectCountry(msg);
      bot.sendMessage(chatId, "🚨 EMERGENCY DETECTED", {
        reply_markup: { inline_keyboard: [[{ text: `🚑 Call Ambulance (${loc.number})`, url: `tel:${loc.number}` }], [{ text: "🏥 Find Hospitals Nearby", url: hospitalLink() }]] }
      });
      return;
    }

    bot.sendMessage(
      chatId,
      `🧠 Assessment Complete\n📊 Severity: *${severity}*\n🏥 Nearby hospitals:\n${hospitalLink()}\n⚠️ Not a medical diagnosis.`,
      { parse_mode: "Markdown" }
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Could not transcribe your voice. Please type your symptoms.");
  }
});

console.log("✅ PulseX Ultra with AI voice transcription is running globally...");
