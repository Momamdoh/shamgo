const express = require("express");
const router = express.Router();

const {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
} = require("../controllers/paymentController");

const {
  verifyDriver,
  verifyTokenAdmin,
} = require("../middlewares/Vcode");

router.post(
  "/driver-monthly-payment",
  verifyDriver,
  createDriverMonthlyPaymentIntent
);

router.post(
  "/activate-subscription",
  verifyDriver,
  activateDriverSubscription
);

router.post(
  "/check-driver-subscription",
  verifyDriver,
  checkDriverSubscription
);

router.get(
  "/drivers-subscriptions",
  verifyTokenAdmin,
  getDriversSubscriptions
);

module.exports = router;