const express = require("express");
const router = express.Router();
const { createTrip, getTripsByUser , offerTrip , refuseTrip , selectDriver , sendChatNotification } = require("../controllers/tripController");

// إنشاء رحلة
router.post("/createtrip", createTrip);
router.post("/accepttrip", offerTrip);
router.post("/refusetrip", refuseTrip);
router.post("/selectdriver", selectDriver);
router.post("/sendmsg",sendChatNotification);




// استرجاع الرحلات حسب الراكب
router.get("/:userId", getTripsByUser);

module.exports = router;
