const express = require("express");

const {
  createOrder,
  getAdminOrders,
  updateOrderStatus,
  getUserOrders,
  cancelUserOrder,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/", createOrder);

router.get("/admin", getAdminOrders);

router.get("/user/:userId", getUserOrders);

router.patch("/:orderId/status", updateOrderStatus);

router.patch("/:orderId/cancel", cancelUserOrder);

module.exports = router;