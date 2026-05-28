const router = require("express").Router();
const multer = require("multer");

const {
  getMessages,
  chat,
  clearHistory
} = require("../controllers/chatController");

// 🔥 رفع الصور في الذاكرة
const upload = multer({
  storage: multer.memoryStorage(),
});

router.get("/messages", getMessages);

// 🔥 دعم صورة + رسالة
router.post(
  "/chat",
  upload.single("image"),
  chat
);

router.post("/clear", clearHistory);

module.exports = router;