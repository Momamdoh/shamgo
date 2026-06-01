const express = require("express");
const router = express.Router();

const {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
} = require("../controllers/paymentController");

router.post(
  "/driver-monthly-payment",
  createDriverMonthlyPaymentIntent
);

router.post(
  "/activate-subscription",
  activateDriverSubscription
);

router.get("/drivers-subscriptions", getDriversSubscriptions);

router.post("/check-driver-subscription", checkDriverSubscription);
module.exports = router;