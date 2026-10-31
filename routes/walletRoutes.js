const express = require("express");
const {
  getWalletBalance,
  getWalletTransactions,
} = require("../controllers/walletController");

// Update this import path if your authentication middleware has another filename.
const { verifyUser } = require("../middlewares/auth");

const router = express.Router();

// These routes must be mounted after the project's existing authentication
// middleware, which must populate req.user. Do not trust a client-supplied userId.
router.get("/balance", verifyUser, getWalletBalance);
router.get("/transactions", verifyUser, getWalletTransactions);

module.exports = router;
