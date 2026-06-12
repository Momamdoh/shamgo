const express = require("express");
const router = express.Router();

const {
  createTraderAd,
  getTraderAds,
  getAdsByCategory,
  getSingleTraderAd,
  updateTraderAd,
  deleteTraderAd,
  searchTraderAds,
} = require("../controllers/traderAdController");

const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

const { verifyTrader } = require("../middlewares/Vcode");

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