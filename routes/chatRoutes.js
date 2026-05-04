const router = require("express").Router();

const {
  getMessages,
  chat,
  clearHistory
} = require("../controllers/chatController");

router.get("/messages", getMessages);
router.post("/chat", chat);
router.post("/clear", clearHistory);

module.exports = router;