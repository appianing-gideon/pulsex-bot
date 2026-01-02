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


import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// ================= CONFIG =================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Conversation state
const userState = {};

// Emergency numbers
const emergencyNumbers = {
  Ghana: "112",
  Nigeria: "112",
  Kenya: "112",
  USA: "911",
  UK: "999",
  default: "112"
};

// =============== /START ====================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  userState[chatId] = { step: 1 };

  await bot.sendMessage(chatId, "Hey, how are you doing? This is PulseX by Alexander Engidion.");
  await bot.sendMessage(chatId, "This bot was created by Alexander Piasa Asiamah & Gideon Appianing.");
  await bot.sendMessage(chatId, "What seems to be wrong?");
  userState[chatId].step = 2;
});

// =============== TEXT ======================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId] || !text || text.startsWith("/")) return;

  if (userState[chatId].step === 2) {
    userState[chatId].symptoms = text;
    userState[chatId].step = 3;

    return bot.sendMessage(chatId, "How severe is your condition? (Mild / Moderate / Severe)");
  }

  if (userState[chatId].step === 3) {
    userState[chatId].severity = text.toLowerCase();

    // AI Prediction
    const prediction = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a medical assistant." },
        {
          role: "user",
          content: `Symptoms: ${userState[chatId].symptoms}. Predict 3 possible conditions.`
        }
      ]
    });

    await bot.sendMessage(
      chatId,
      "🧠 Possible conditions:\n" + prediction.choices[0].message.content
    );

    // Tips & drugs
    const tips = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a medical assistant." },
        {
          role: "user",
          content: `Give safety tips and over-the-counter drug suggestions for: ${userState[chatId].symptoms}`
        }
      ]
    });

    await bot.sendMessage(
      chatId,
      "💡 Tips & Drug Suggestions:\n" + tips.choices[0].message.content
    );

    await bot.sendMessage(
      chatId,
      "You may now upload a picture of the problem (if visible) or send a voice message."
    );

    userState[chatId].step = 4;
  }
});

// =============== IMAGE =====================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const photo = msg.photo[msg.photo.length - 1];
  const file = await bot.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const analysis = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You analyze visible medical conditions in images." },
      { role: "user", content: `Analyze this image: ${fileUrl}` }
    ]
  });

  await bot.sendMessage(
    chatId,
    "🖼 Image Analysis:\n" + analysis.choices[0].message.content
  );

  if (userState[chatId]?.severity === "severe") {
    await bot.sendMessage(chatId, "⚠️ This seems severe. Please share your location.", {
      reply_markup: {
        keyboard: [[{ text: "📍 Share Location", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }
});

// =============== VOICE =====================
bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;
  const file = await bot.getFile(msg.voice.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const transcript = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: fileUrl
  });

  await bot.sendMessage(chatId, "🎙 You said: " + transcript.text);
});

// =============== LOCATION (FINAL) ==========
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const geo = await axios.get(
    `https://nominatim.openstreetmap.org/reverse`,
    { params: { format: "json", lat: latitude, lon: longitude } }
  );

  const country = geo.data.address?.country || "default";
  const emergency = emergencyNumbers[country] || emergencyNumbers.default;

  const hospitals = await axios.get(
    `https://nominatim.openstreetmap.org/search`,
    { params: { q: "hospital", format: "json", limit: 5, lat: latitude, lon: longitude } }
  );

  const list = hospitals.data.map(h => `- ${h.display_name}`).join("\n");

  await bot.sendMessage(chatId, "🚑 EMERGENCY SUPPORT", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Call Ambulance 🚨", url: `tel:${emergency}` }]
      ]
    }
  });

  await bot.sendMessage(chatId, "🏥 Nearby Hospitals:\n" + list);
});

console.log("✅ PulseX bot running with node-telegram-bot-api");
