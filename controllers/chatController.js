const {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages,
} = require("../config/chatbot");

// ===============================
// Get Messages
// ===============================
exports.getMessages = (
  req,
  res
) => {
  res.json(
    messagesStore
  );
};

// ===============================
// Chat / Virtual Try-On
// ===============================
exports.chat = async (
  req,
  res
) => {
  console.log(
    "🔥 CHAT API HIT"
  );

  try {
    console.log(
      "📝 BODY =>",
      req.body
    );

    console.log(
      "🖼 FILE =>",
      req.file
        ? {
            originalname:
              req.file
                .originalname,

            mimetype:
              req.file
                .mimetype,

            size:
              req.file
                .size,

            hasBuffer:
              !!req.file
                .buffer,
          }
        : null
    );

    // ===============================
    // Request Data
    // ===============================
    const userMessage =
      (
        req.body
          .message ||
        ""
      )
        .toString()
        .trim();

    const imageFile =
      req.file ||
      null;

    const productImageUrl =
      req.body
        .productImageUrl
        ?.toString()
        .trim() ||
      null;

    const tryOnCategory =
      req.body
        .tryOnCategory
        ?.toString()
        .trim() ||
      null;

    const productTitle =
      req.body
        .productTitle
        ?.toString()
        .trim() ||
      null;

    const virtualTryOn =
      req.body
        .virtualTryOn;

    // ===============================
    // Logs
    // ===============================
    console.log(
      "💬 MESSAGE =>",
      userMessage
    );

    console.log(
      "🛍 PRODUCT IMAGE URL =>",
      productImageUrl
    );

    console.log(
      "📂 TRY ON CATEGORY =>",
      tryOnCategory
    );

    console.log(
      "🏷 PRODUCT TITLE =>",
      productTitle
    );

    console.log(
      "✨ VIRTUAL TRY ON =>",
      virtualTryOn
    );

    // ===============================
    // Validate User Image
    // ===============================
    if (
      !imageFile ||
      !imageFile.buffer
    ) {
      return res
        .status(400)
        .json({
          status:
            "fail",

          error:
            "User image is required",
        });
    }

    // ===============================
    // Validate Product Image
    // ===============================
    if (
      !productImageUrl
    ) {
      return res
        .status(400)
        .json({
          status:
            "fail",

          error:
            "Product image is required",
        });
    }

    // ===============================
    // Validate Category
    // ===============================
    if (
      !tryOnCategory
    ) {
      return res
        .status(400)
        .json({
          status:
            "fail",

          error:
            "Product category is required",
        });
    }

    const allowedCategories = [
      "clothes",
      "dress_rental",
      "makeup",
    ];

    if (
      !allowedCategories
        .includes(
          tryOnCategory
        )
    ) {
      return res
        .status(400)
        .json({
          status:
            "fail",

          error:
            `Unsupported product category: ${tryOnCategory}`,
        });
    }

    // ===============================
    // Default Message
    // ===============================
    const finalMessage =
      userMessage ||
      "Show this exact product on me realistically.";

    console.log(
      "💬 FINAL MESSAGE =>",
      finalMessage
    );

    // ===============================
    // IMPORTANT:
    // Send Product Data To modelTurn
    // ===============================
    const aiResult =
      await modelTurn(
        finalMessage,
        imageFile,
        {
          productImageUrl:
            productImageUrl,

          tryOnCategory:
            tryOnCategory,

          productTitle:
            productTitle,

          virtualTryOn:
            virtualTryOn,
        }
      );

    console.log(
      "🤖 AI RESULT =>",
      aiResult
    );

    // ===============================
    // Result Text
    // ===============================
    const aiText =
      typeof aiResult ===
      "string"
        ? aiResult
        : aiResult?.text ||
          "تم تركيب المنتج على صورتك بنجاح";

    // ===============================
    // Result Image
    // ===============================
    const imageUrl =
      typeof aiResult ===
      "object"
        ? aiResult
            ?.imageUrl ||
          null
        : null;

    // ===============================
    // Save History
    // ===============================
    updateConversationHistory(
      `${finalMessage} [image uploaded]`,

      imageUrl
        ? `${aiText}\n${imageUrl}`
        : aiText
    );

    // ===============================
    // Response
    // ===============================
    return res
      .status(200)
      .json({
        status:
          "success",

        message:
          aiText,

        imageUrl:
          imageUrl,
      });
  } catch (err) {
    console.error(
      "❌ CHAT ERROR =>",
      err
    );

    console.error(
      "❌ CHAT ERROR MESSAGE =>",
      err.message
    );

    return res
      .status(500)
      .json({
        status:
          "fail",

        error:
          err.message ||
          "Virtual try-on failed",
      });
  }
};

// ===============================
// Clear History
// ===============================
exports.clearHistory = (
  req,
  res
) => {
  clearMessages();

  return res
    .status(200)
    .json({
      status:
        "success",

      message:
        "Conversation history cleared",
    });
};