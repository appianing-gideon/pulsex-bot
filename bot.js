require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

// Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// OpenAI client (NEW way)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const userStates = {};    // conversation stage
const userHistory = {};  // symptom memory

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userHistory[chatId]) userHistory[chatId] = [];
  userStates[chatId] = { stage: 'ask_symptoms', symptoms: [] };

  let greeting =
    "Hey, how are you doing?\n" +
    "This is PulseX, created by Alexander Piasa Asiamah and Gideon Appianing.\n";
    "This is PulseX 🤖, created by Alexander Piasa Asiamah and Gideon Appianing.\n";

  if (userHistory[chatId].length > 0) {
    greeting += "I remember your past symptoms.\n";
  }

  greeting += "Please tell me your main symptom(s).";

  bot.sendMessage(chatId, greeting);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  if (!userStates[chatId]) {
    bot.sendMessage(chatId, "Type /start to begin.");
    return;
  }

  const state = userStates[chatId];

  try {
    if (state.stage === 'ask_symptoms') {
      state.symptoms.push(text);
      state.stage = 'ask_followup';

      bot.sendMessage(
        chatId,
        "Can you describe any other symptoms? (duration, severity, etc.)"
      );

    } else if (state.stage === 'ask_followup') {
      state.symptoms.push(text);
      state.stage = 'predict';

      userHistory[chatId].push(...state.symptoms);

      bot.sendMessage(chatId, "Analyzing your symptoms...");

      const prompt = `
User symptom history: ${userHistory[chatId].join(', ')}.
Suggest up to 3 possible causes with brief explanations.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a medical assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 400,
      });

      const prediction = response.choices[0].message.content;

      bot.sendMessage(
        chatId,
        `${prediction}\n\n(Created by Alexander Piasa Asiamah and Gideon Appianing)`
      );

      delete userStates[chatId];
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "Something went wrong. Please try again.");
  }
});
