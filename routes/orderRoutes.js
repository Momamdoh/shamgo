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

// IMPORTANT: This checks req.user only. Your existing authentication middleware
// must run before this route and populate req.user from a verified token/session.
// Never trust a userId supplied in the request body as authentication.
const requireAuthenticatedUser = (req, res, next) => {
  if (!req.user?._id && !req.user?.id) {
    return res.status(401).json({
      status: "fail",
      message: "يجب تسجيل الدخول لإلغاء الطلب واسترداد الرصيد",
    });
  }
  next();
};

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
router.patch("/:orderId/cancel", requireAuthenticatedUser, cancelUserOrder);

module.exports = router;
