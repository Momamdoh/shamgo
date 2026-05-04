const express = require("express");
const router = express.Router();

const {
  createTraderAd,
  getTraderAds,
  getAdsByCategory,
  getSingleTraderAd,
  updateTraderAd,
  deleteTraderAd,
} = require("../controllers/traderAdController");

// ✅ استيراد middleware الصورة
const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

// 🔥 إنشاء إعلان (مع رفع صورة)
router.post(
  "/create",
  uploadTraderAdImage,
  processTraderAdImage,
  createTraderAd
);

// جلب كل إعلانات تاجر
router.get("/trader/:traderId", getTraderAds);

// جلب الإعلانات حسب الفئة
router.get("/category/:category", getAdsByCategory);

// جلب إعلان واحد
router.get("/:adId", getSingleTraderAd);

// 🔥 تعديل إعلان
router.put(
  "/:adId",
  uploadTraderAdImage,
  processTraderAdImage,
  updateTraderAd
);

// حذف إعلان
router.delete("/:adId", deleteTraderAd);

module.exports = router;