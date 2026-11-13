const router = require("express").Router();
const multer = require("multer");

const {
  getMessages,
  chat,
  clearHistory,
} = require("../controllers/chatController");

// Upload image in memory (unchanged)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// Existing chatbot endpoints (unchanged)
router.get("/messages", getMessages);
router.post("/chat", upload.single("image"), chat);
router.post("/clear", clearHistory);

// Add Gemini voice endpoint to the SAME /api/chatbot router.
// The separate file registers POST /voice.
// Secure this endpoint with your existing authentication + rate limiting
// BEFORE exposing it in production (uses prepaid API balance).
router.use(require("./geminiVoice"));

module.exports = router;