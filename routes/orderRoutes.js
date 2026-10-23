const express = require("express");

const {
  createOrder,
  getAdminOrders,
  updateOrderStatus,
  getUserOrders,
  cancelUserOrder,
  getOrderShamCashPaymentDetails,
} = require("../controllers/orderController");

const router = express.Router();

// ===============================
// Create Order
// ===============================
router.post(
  "/",
  createOrder
);

// ===============================
// Sham Cash Payment Details
// ===============================
router.get(
  "/shamcash-details",
  getOrderShamCashPaymentDetails
);

// ===============================
// Admin Orders
// ===============================
router.get(
  "/admin",
  getAdminOrders
);

// ===============================
// User Orders
// ===============================
router.get(
  "/user/:userId",
  getUserOrders
);

// ===============================
// Update Order Status
// ===============================
router.patch(
  "/:orderId/status",
  updateOrderStatus
);

// ===============================
// Cancel User Order
// ===============================
router.patch(
  "/:orderId/cancel",
  cancelUserOrder
);

module.exports = router;