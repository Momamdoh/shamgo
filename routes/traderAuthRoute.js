const express = require("express");
const router = express.Router();

const {
  traderSignup,
  traderVerify,
  traderLogin,
  updateTraderFcmToken,
  sendTraderResetCode,
  verifyTraderResetCode,
  resetTraderPassword,
  getPendingTradersForAdmin,
  approveTraderByAdmin,
  rejectTraderByAdmin,
} = require("../controllers/traderAuthController");

const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

router.post(
  "/signup",
  uploadTraderAdImage,
  processTraderAdImage,
  traderSignup
);

router.post("/verify", traderVerify);

router.post("/login", traderLogin);

router.post("/token", updateTraderFcmToken);

router.post("/forgot-password", sendTraderResetCode);

router.post("/verify-reset-code", verifyTraderResetCode);

router.post("/reset-password", resetTraderPassword);

router.get("/pending-traders", getPendingTradersForAdmin);

router.post("/approve-trader", approveTraderByAdmin);

router.post("/reject-trader", rejectTraderByAdmin);

module.exports = router;