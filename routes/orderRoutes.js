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
  cancelOrderShamCashInvoice,
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
// Cancel ShamCash Invoice
// IMPORTANT: route must be protected by existing authentication middleware
// and handler must validate req.user and invoice state.
// ===============================
router.post("/:orderId/shamcash/cancel", cancelOrderShamCashInvoice);

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
