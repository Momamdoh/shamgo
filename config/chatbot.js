const axios = require("axios");

const messagesStore = [];

function updateConversationHistory(userMessage, botResponse) {
  messagesStore.push({
    id: messagesStore.length + 1,
    user: userMessage,
    bot: botResponse
  });
}

function clearMessages() {
  messagesStore.length = 0;
}

async function modelTurn(userMessage) {

  const GOOGLE_API_KEY = "AIzaSyCdGNlDVcqOpatJBa4A7qbq7AFt7D5wtBM";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ],

    tools: [
      {
        google_search: {}
      }
    ]
  };

  try {
    const response = await axios.post(url, payload);

    const parts =
      response.data?.candidates?.[0]?.content?.parts || [];

    return parts
      .map(p => p.text)
      .filter(Boolean)
      .join("\n");

  } catch (error) {
    console.error("Gemini Error:", error.response?.data || error.message);
    throw new Error("Gemini error");
  }
}

module.exports = {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages
};