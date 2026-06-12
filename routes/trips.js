const express = require("express");
const router = express.Router();

const {
  createTrip,
  getTripsByUser,
  offerTrip,
  selectDriver,
  sendChatNotification,
  getActiveDriverTrip,
  getActiveUserTrip,
  getDriverLiveLocation,
  completeTrip,
  cancelTripByUser,
  cancelTripByDriver,
  getAllUserTrips,
  getAllDriverTrips,
  updateTripPriceByUser,
} = require("../controllers/tripController");

const {
  verifyUser,
  verifyDriver,
} = require("../middlewares/Vcode");
// إنشاء رحلة بواسطة الراكب
router.post("/createtrip", verifyUser, createTrip);

// إرسال عرض بواسطة السائق
router.post("/accepttrip", verifyDriver, offerTrip);

// اختيار السائق بواسطة الراكب
router.post("/selectdriver", verifyUser, selectDriver);

// إرسال الرسائل (يوزر أو سائق)
router.post("/sendmsg", sendChatNotification);

// الرحلة الحالية للسائق
router.post("/active-driver-trip", verifyDriver, getActiveDriverTrip);

// الرحلة الحالية للراكب
router.post("/active-user-trip", verifyUser, getActiveUserTrip);

// موقع السائق المباشر
router.post("/driver-live-location", getDriverLiveLocation);

// إنهاء الرحلة بواسطة السائق
router.post("/complete-trip", verifyDriver, completeTrip);

// إلغاء الرحلة بواسطة الراكب
router.post("/cancel-by-user", verifyUser, cancelTripByUser);

// إلغاء الرحلة بواسطة السائق
router.post("/cancel-by-driver", verifyDriver, cancelTripByDriver);

// تعديل سعر الرحلة بواسطة الراكب
router.post("/update-trip-price", verifyUser, updateTripPriceByUser);

// جميع رحلات الراكب
router.get("/user-trips/:userId", verifyUser, getAllUserTrips);

// جميع رحلات السائق
router.get("/driver-trips/:driverId", verifyDriver, getAllDriverTrips);

// استرجاع الرحلات حسب الراكب
router.get("/:userId", verifyUser, getTripsByUser);

module.exports = router;