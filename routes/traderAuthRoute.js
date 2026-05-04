const express = require("express");
const router = express.Router();

const {
  traderSignup,
  traderLogin,
  updateTraderFcmToken,
} = require("../controllers/traderAuthController");

router.post("/signup", traderSignup);
router.post("/login", traderLogin);
router.post("/token", updateTraderFcmToken);

module.exports = router;