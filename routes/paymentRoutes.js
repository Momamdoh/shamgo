const express = require("express");

const router = express.Router();

const {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
} = require("../controllers/paymentController");


// ===============================
// DRIVER MONTHLY PAYMENT
// ===============================

router.post(
  "/driver-monthly-payment",
  createDriverMonthlyPaymentIntent
);


// ===============================
// ACTIVATE SUBSCRIPTION
// ===============================

router.post(
  "/activate-subscription",
  activateDriverSubscription
);


// ===============================
// CHECK SUBSCRIPTION
// ===============================

router.post(
  "/check-driver-subscription",
  checkDriverSubscription
);


// ===============================
// ADMIN SUBSCRIPTIONS
// ===============================

router.get(
  "/drivers-subscriptions",
  getDriversSubscriptions
);


module.exports = router;