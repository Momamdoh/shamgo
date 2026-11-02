const express = require("express");

const router = express.Router();

const {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
} = require("../controllers/paymentController");

// The existing auth.js middleware must export these functions.
// Driver subscription endpoints require a verified driver JWT.
const { verifyDriver, verifyTokenAdmin } = require("../middlewares/auth");

// ===============================
// DRIVER MONTHLY PAYMENT
// ===============================
router.post(
  "/driver-monthly-payment",
  verifyDriver,
  createDriverMonthlyPaymentIntent
);

// ===============================
// ACTIVATE SUBSCRIPTION
// ===============================
router.post(
  "/activate-subscription",
  verifyDriver,
  activateDriverSubscription
);

// ===============================
// CHECK SUBSCRIPTION
// ===============================
router.post(
  "/check-driver-subscription",
  verifyDriver,
  checkDriverSubscription
);

// ===============================
// ADMIN SUBSCRIPTIONS
// ===============================
router.get(
  "/drivers-subscriptions",
  verifyTokenAdmin,
  getDriversSubscriptions
);

module.exports = router;
