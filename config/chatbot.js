const axios = require("axios");

const messagesStore = [];

function updateConversationHistory(userMessage, botResponse) {
  messagesStore.push({
    id: messagesStore.length + 1,
    user: userMessage,
    bot: botResponse,
  });
}

function clearMessages() {
  messagesStore.length = 0;
}

async function modelTurn(userMessage) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is missing");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const parts = response.data?.candidates?.[0]?.content?.parts || [];

    const text = parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    return text || "No response from Gemini";
  } catch (error) {
    console.error("Gemini Error:", error.response?.data || error.message);
    throw new Error("Gemini error");
  }
}

module.exports = {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages,
};