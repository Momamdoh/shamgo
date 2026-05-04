const {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages
} = require("../config/chatbot");

exports.getMessages = (req, res) => {
  res.json(messagesStore);
};

exports.chat = async (req, res) => {
  try {
    const userMessage = (req.body.message || "").trim();

    if (!userMessage) {
      return res.status(400).json({
        error: "Message not provided"
      });
    }

    const aiMessage = await modelTurn(userMessage);

    updateConversationHistory(userMessage, aiMessage);

    res.json({
      message: aiMessage
    });
  } catch (err) {
    console.error("Chat Error:", err.message);

    res.status(500).json({
      error: err.message || "Chat error"
    });
  }
};

exports.clearHistory = (req, res) => {
  clearMessages();

  res.json({
    message: "Conversation history cleared"
  });
};