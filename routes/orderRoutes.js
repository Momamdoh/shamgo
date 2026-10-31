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

const { verifyUser } = require("../middlewares/auth");

// ===============================
// Create Order
// ===============================
// Wallet payments require the verified user identity. Preserve existing
// checkout behavior for cash-on-delivery and ShamCash.
const verifyWalletPaymentUser = (req, res, next) => {
  if (req.body?.paymentMethod === "wallet_balance") {
    return verifyUser(req, res, next);
  }
  next();
};
router.post("/", verifyWalletPaymentUser, createOrder);

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
router.patch("/:orderId/cancel", verifyUser, cancelUserOrder);

module.exports = router;
