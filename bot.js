require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
const fs = require("fs");
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

// ---------------- EMERGENCY PHRASE TRIGGERS ----------------
const emergencyPhraseTriggers = [
  "call ambulance",
  "type call ambulance",
  "i want to die",
  "i feel like dying",
  "i can’t breathe",
  "i can't breathe",
  "shortness of breath",
  "my breath has seizures",
  "i am having seizures",
  "seizure",
  "i am choking"
];

function isEmergencyPhrase(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return emergencyPhraseTriggers.some(t => lower.includes(t));
}

// ---------------- AI EMERGENCY INTENT DETECTION ----------------
async function aiDetectEmergencyIntent(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a medical safety classifier. Answer ONLY 'YES' or 'NO'. Say YES if the text indicates suicide, breathing difficulty, seizure, collapse, or immediate danger."
        },
        { role: "user", content: text }
      ]
    });
    return response.choices[0].message.content.trim() === "YES";
  } catch (e) {
    return false; // fail-safe
  }
}

// ---------------- SAFE MEDICATION GUIDANCE + AI DRUG SUGGESTION ----------------
async function generateMedicationAdvice(symptoms) {
  // Local rules first
  let advice = "";
  if (/headache|fever/i.test(symptoms)) {
    advice = "💊 *Possible relief:* Paracetamol (Acetaminophen)\n⚠️ Do not exceed recommended dose. Avoid if allergic.";
  } else if (/stomach|abdominal|diarrhea/i.test(symptoms)) {
    advice = "💊 *Possible relief:* Oral rehydration solution or antacids.\n⚠️ Avoid NSAIDs.";
  }

  // AI suggestion for additional guidance
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional pharmacist. Provide safe, over-the-counter medications and remedies for common symptoms. Never suggest prescription-only drugs. Provide concise advice." },
        { role: "user", content: `Symptoms: ${symptoms}` }
      ]
    });
    const aiAdvice = completion.choices[0].message.content;
    if (aiAdvice) advice += `\n\n💡 *AI-based suggestion:*\n${aiAdvice}`;
  } catch (e) {
    // fail silently if API fails
  }

  return advice || "💊 Please consult a healthcare professional for your symptoms.";
}

// ---------------- FOLLOW-UP QUESTIONS ----------------
async function generateFollowUp(symptoms) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are PulseX, an AI healthcare assistant. Ask 1-2 relevant follow-up questions to clarify the patient's condition based on the symptoms." },
        { role: "user", content: `Symptoms: ${symptoms}` }
      ]
    });
    return completion.choices[0].message.content || "";
  } catch (e) {
    return "";
  }
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

// ---------------- VOICE INPUT WITH WHISPER ----------------
bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;
  const country = msg.from.language_code?.toUpperCase() || "GH";

  try {
    // Download voice file
    const fileId = msg.voice.file_id;
    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const filePath = `/tmp/voice_${chatId}.ogg`;
    const writer = fs.createWriteStream(filePath);
    const response = await axios.get(url, { responseType: "stream" });
    response.data.pipe(writer);
    await new Promise(resolve => writer.on("finish", resolve));

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1"
    });
    const text = transcription.text;

    const severity = calculateSeverity(text);
    const aiEmergency = await aiDetectEmergencyIntent(text);

    if (isEmergencyPhrase(text) || isEmergency(severity) || aiEmergency) {
      bot.sendMessage(
        chatId,
        `🚨 *MEDICAL EMERGENCY DETECTED (from voice)*

📊 Severity: *${severity}/10*

⛔ Do NOT wait.
📞 Call emergency services immediately.`,
        { parse_mode: "Markdown", reply_markup: emergencyInlineButton(country) }
      );
      return;
    }

    // AI Response + follow-up + medication advice
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are PulseX, an AI healthcare assistant. Never diagnose. Ask questions, assess severity, give safe advice." },
        { role: "user", content: text }
      ]
    });

    const followUp = await generateFollowUp(text);
    const meds = await generateMedicationAdvice(text);

    bot.sendMessage(
      chatId,
      `🎙️ *Transcribed voice message:* ${text}

${completion.choices[0].message.content}

📊 *Severity:* ${severity}/10

${meds}

❓ Follow-up question(s):
${followUp}`,
      { parse_mode: "Markdown" }
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Unable to process voice message. If urgent, call local emergency services immediately.");
  }
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

  const aiEmergency = await aiDetectEmergencyIntent(text);

  if (isEmergencyPhrase(text) || isEmergency(severity) || aiEmergency) {
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

  // AI Response + follow-up + medication advice
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are PulseX, an AI healthcare assistant. Never diagnose. Ask questions, assess severity, give safe advice." },
        { role: "user", content: text }
      ]
    });

    const followUp = await generateFollowUp(text);
    const meds = await generateMedicationAdvice(text);

    bot.sendMessage(
      chatId,
      `${completion.choices[0].message.content}

📊 *Severity:* ${severity}/10

${meds}

❓ Follow-up question(s):
${followUp}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    bot.sendMessage(chatId, "⚠️ I’m having trouble responding. If urgent, contact a healthcare professional immediately.");
  }
});

console.log("✅ PulseX bot is running with AI drug advice + follow-up!");
