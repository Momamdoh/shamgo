const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
      immutable: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      enum: ["order_refund", "order_payment"],
      required: true,
      immutable: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Transaction amount must be a positive integer in SYP",
      },
    },
    currency: {
      type: String,
      default: "SYP",
      enum: ["SYP"],
      required: true,
      immutable: true,
    },
    // Set by the server, never accept this value directly from Flutter.
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Previous balance must be a non-negative integer",
      },
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "New balance must be a non-negative integer",
      },
    },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model("WalletTransaction", walletTransactionSchema);

module.exports = { WalletTransaction };
