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

router.post(
  "/create",
  uploadTraderAdImage,
  processTraderAdImage,
  createTraderAd
);

router.get("/trader/:traderId", getTraderAds);

router.get("/category/:category", getAdsByCategory);

// 🔍 لازم يكون قبل :adId
router.get("/search", searchTraderAds);

router.get("/:adId", getSingleTraderAd);

router.put(
  "/:adId",
  uploadTraderAdImage,
  processTraderAdImage,
  updateTraderAd
);

router.delete("/:adId", deleteTraderAd);

module.exports = router;