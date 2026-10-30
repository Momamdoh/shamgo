const express = require("express");

const {
  createOrder,
  getAdminOrders,
  updateOrderStatus,
  getTraderOrders,
  updateTraderOrderItemStatus,
  getUserOrders,
  cancelUserOrder,
  getOrderShamCashPaymentDetails,
  verifyOrderShamCashPayment,
} = require("../controllers/orderController");

const router = express.Router();

// ===============================
// Create Order
// ===============================
router.post("/", createOrder);

// ===============================
// Sham Cash Details
// ===============================
router.get("/shamcash-details", getOrderShamCashPaymentDetails);

// ===============================
// Verify ShamCash Invoice Payment
// ===============================
router.post("/:orderId/shamcash/verify", verifyOrderShamCashPayment);

// ===============================
// Admin Orders
// ===============================
router.get("/admin", getAdminOrders);

// ===============================
// Trader Orders
// ===============================
router.get("/trader/:traderId", getTraderOrders);

// ===============================
// Trader Update Item Status
// ===============================
router.patch("/:orderId/items/:itemId/status", updateTraderOrderItemStatus);

// ===============================
// User Orders
// ===============================
router.get("/user/:userId", getUserOrders);

// ===============================
// Admin Update Order Status
// ===============================
router.patch("/:orderId/status", updateOrderStatus);

// ===============================
// User Cancel Order
// ===============================
router.patch("/:orderId/cancel", cancelUserOrder);

module.exports = router;
