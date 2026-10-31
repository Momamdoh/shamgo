
const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      immutable: true,
    },
    balance: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Wallet balance must be a non-negative integer in SYP",
      },
    },
    currency: {
      type: String,
      default: "SYP",
      enum: ["SYP"],
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);

const Wallet =
  mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);

module.exports = { Wallet };
