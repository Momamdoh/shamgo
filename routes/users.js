const express = require("express");
const router = express.Router();

const {
  verifyTokenAdmin,
  verifyUser,
} = require("../middlewares/Vcode");

const {
  AdmingetUserById,
  AdminEditUserDetails,
  AdmindeleteUser,
  updateUserLocation,
} = require("../controllers/UserController");

// =====================================
// Favorite Controllers
// =====================================
const {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  getAdFavoriteCount,
} = require("../controllers/FavoriteController");

// =====================================
// Rating Controllers
// =====================================
const {
  addOrUpdateRating,
  getAdRating,
} = require("../controllers/RatingController");


// =====================================
// User Routes
// =====================================

router.post(
  "/update-location",
  verifyUser,
  updateUserLocation
);

router.put(
  "/:id",
  verifyUser,
  AdminEditUserDetails
);

router.get(
  "/admin",
  verifyTokenAdmin,
  AdmingetUserById
);

router.get(
  "/:id/admin",
  verifyUser,
  AdmingetUserById
);

router.delete(
  "/:id/deleteadmin",
  verifyUser,
  AdmindeleteUser
);


// =====================================
// Favorite Routes
// =====================================

// إضافة المنتج للمفضلة
router.post(
  "/favorite/:adId",
  verifyUser,
  addFavorite
);

// حذف المنتج من المفضلة
router.delete(
  "/favorite/:adId",
  verifyUser,
  removeFavorite
);

// عرض مفضلة المستخدم
router.get(
  "/favorites",
  verifyUser,
  getUserFavorites
);

// جلب عدد الإعجابات لمنتج معين
router.get(
  "/favorite/:adId/count",
  getAdFavoriteCount
);


// =====================================
// Rating Routes
// =====================================

// إضافة أو تعديل تقييم المنتج
router.post(
  "/rating/:adId",
  verifyUser,
  addOrUpdateRating
);

// جلب تقييم المنتج
router.get(
  "/rating/:adId",
  getAdRating
);


module.exports = router;