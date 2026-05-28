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
  console.log("🔥 CHAT API HIT");

  try {
    console.log("📝 BODY =>", req.body);
    console.log(
      "🖼 FILE =>",
      req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            hasBuffer: !!req.file.buffer,
          }
        : null
    );

    const userMessage = (req.body.message || "").trim();
    const imageFile = req.file || null;

    if (!userMessage && !imageFile) {
      return res.status(400).json({
        error: "Message or image not provided",
      });
    }

    const finalMessage =
  userMessage || "حط مكياج مناسب على الصورة";

    console.log("💬 FINAL MESSAGE =>", finalMessage);

    const aiResult = await modelTurn(finalMessage, imageFile);

    console.log("🤖 AI RESULT =>", aiResult);

    const aiText =
      typeof aiResult === "string"
        ? aiResult
        : aiResult?.text || "No response";

    const imageUrl =
      typeof aiResult === "object"
        ? aiResult?.imageUrl || null
        : null;

    updateConversationHistory(
      imageFile ? `${finalMessage} [image uploaded]` : finalMessage,
      imageUrl ? `${aiText}\n${imageUrl}` : aiText
    );

    res.json({
      message: aiText,
      imageUrl: imageUrl,
    });
  } catch (err) {
    console.error("Chat Error:", err.message);

    res.status(500).json({
      error: err.message || "Chat error",
    });
  }
};

exports.clearHistory = (req, res) => {
  clearMessages();

  res.json({
    message: "Conversation history cleared",
  });
};