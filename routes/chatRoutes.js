const router = require("express").Router();
const multer = require("multer");

const {
  getMessages,
  chat,
  clearHistory,
} = require("../controllers/chatController");

// ===============================
// Upload image in memory
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ===============================
// Get Messages
// ===============================
router.get(
  "/messages",
  getMessages
);

// ===============================
// Virtual Try-On
// صورة المستخدم + بيانات المنتج
// ===============================
router.post(
  "/chat",
  upload.single("image"),
  chat
);

// ===============================
// Clear History
// ===============================
router.post(
  "/clear",
  clearHistory
);

module.exports = router;