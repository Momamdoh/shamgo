const express = require("express");
const {
  getWalletBalance,
  getWalletTransactions,
} = require("../controllers/walletController");

const router = express.Router();

// These routes must be mounted after the project's existing authentication
// middleware, which must populate req.user. Do not trust a client-supplied userId.
router.get("/balance", getWalletBalance);
router.get("/transactions", getWalletTransactions);

module.exports = router;
