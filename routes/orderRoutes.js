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

const { Order } = require("../models/Order");
const mongoose = require("mongoose");

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
// Public Trader Order Count (No Customer Details)
// ===============================
// Counts distinct orders containing at least one item from the trader.
// Includes all order statuses, matching getTraderOrders' count semantics.
router.get("/trader/:traderId/public-stats", async (req, res) => {
  try {
    const { traderId } = req.params;

    if (!mongoose.isValidObjectId(traderId)) {
      return res.status(400).json({
        status: "fail",
        message: "معرف التاجر غير صحيح",
      });
    }

    const { Trader } = require("../models/Trader");
    const exists = await Trader.exists({ _id: traderId });
    if (!exists) {
      return res.status(404).json({
        status: "fail",
        message: "التاجر غير موجود",
      });
    }

    const ordersCount = await Order.countDocuments({
      "items.trader": new mongoose.Types.ObjectId(traderId),
    });

    return res.status(200).json({
      status: "success",
      traderId,
      ordersCount,
    });
  } catch (error) {
    console.error("Public trader order stats:", error);
    return res.status(500).json({
      status: "fail",
      message: "تعذر تحميل عدد الطلبات",
    });
  }
});

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
