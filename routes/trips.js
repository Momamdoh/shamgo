const express = require("express");
const router = express.Router();

const {
  createTrip,
  getTripsByUser,
  offerTrip,
  refuseTrip,
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

// إنشاء رحلة
router.post("/createtrip", createTrip);

router.post("/accepttrip", offerTrip);

router.post("/refusetrip", refuseTrip);

router.post("/selectdriver", selectDriver);

router.post("/sendmsg", sendChatNotification);

router.post("/active-driver-trip", getActiveDriverTrip);

router.post("/active-user-trip", getActiveUserTrip);

router.post("/driver-live-location", getDriverLiveLocation);

router.post("/complete-trip", completeTrip);

router.post("/cancel-by-user", cancelTripByUser);

router.post("/cancel-by-driver", cancelTripByDriver);

router.post("/update-trip-price", updateTripPriceByUser);

router.get("/user-trips/:userId", getAllUserTrips);

router.get("/driver-trips/:driverId", getAllDriverTrips);

// استرجاع الرحلات حسب الراكب
router.get("/:userId", getTripsByUser);

module.exports = router;