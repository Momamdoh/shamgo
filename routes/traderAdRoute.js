const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const {
  createTraderAd,
  getTraderAds,
  getAdsByCategory,
  getSingleTraderAd,
  updateTraderAd,
  deleteTraderAd,
  searchTraderAds,
  createTraderMonthlyPaymentIntent,
  activateTraderSubscription,
  checkTraderSubscription,
  getTradersSubscriptions,
} = require("../controllers/traderAdController");

const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

const { verifyTrader } = require("../middlewares/Vcode");

// Protect admin subscription data without assuming an unavailable middleware export.
const verifySubscriptionAdmin = (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : req.headers.token;

  if (!token) {
    return res.status(401).json({ success: false, message: "No Token Provided" });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET_KEY);
    if (claims.isAdmin !== true) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    req.user = claims;
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Invalid Token" });
  }
};

// Trader ShamCash monthly subscription: these routes must precede /:adId.
router.post(
  "/subscription/monthly-payment",
  verifyTrader,
  createTraderMonthlyPaymentIntent
);

router.post(
  "/subscription/activate",
  verifyTrader,
  activateTraderSubscription
);

router.post(
  "/subscription/check",
  verifyTrader,
  checkTraderSubscription
);

router.get(
  "/subscription/admin/traders",
  verifySubscriptionAdmin,
  getTradersSubscriptions
);

router.post(
  "/create",
  verifyTrader,
  uploadTraderAdImage,
  processTraderAdImage,
  createTraderAd
);

router.get("/trader/:traderId", verifyTrader, getTraderAds);

router.get("/category/:category", getAdsByCategory);

router.get("/search", searchTraderAds);

router.get("/:adId", getSingleTraderAd);

router.put(
  "/:adId",
  verifyTrader,
  uploadTraderAdImage,
  processTraderAdImage,
  updateTraderAd
);

router.delete("/:adId", verifyTrader, deleteTraderAd);

module.exports = router;
