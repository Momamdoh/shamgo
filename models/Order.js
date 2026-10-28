const mongoose = require("mongoose");
const Joi = require("joi");

const OrderItemSchema = new mongoose.Schema(
  {
    ad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TraderAd",
      required: true,
    },
    trader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trader",
      required: true,
    },
    title: { type: String, trim: true },
    image: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    selectedColor: { type: String, trim: true, default: null },
    selectedSize: {
      type: String,
      trim: true,
      enum: ["S", "M", "L", "XL", null],
      default: null,
    },
    total: { type: Number, required: true, min: 0 },

    // Item Status (unchanged)
    status: {
      type: String,
      enum: [
        "pending", "accepted", "shipped", "out_for_delivery",
        "delivered", "rejected", "cancelled",
      ],
      default: "pending",
    },
    statusUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 500,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      minlength: 6,
      maxlength: 30,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: [(v) => v.length > 0, "order items required"],
    },
    totalPrice: { type: Number, required: true, min: 0 },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["cash_on_delivery", "sham_cash_wallet"],
      required: true,
      default: "cash_on_delivery",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },

    // NEW: invoice created for this specific order
    shamCashInvoiceNumber: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // Transaction ID is provided LATER at payment verification, not at checkout
    shamCashTransactionId: {
      type: String,
      trim: true,
      default: null,
    },
    shamCashPaymentAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    shamCashPaymentCurrency: {
      type: String,
      trim: true,
      default: null,
    },
    shamCashPaymentAt: { type: Date, default: null },

    // Order Status (unchanged)
    status: {
      type: String,
      enum: [
        "pending", "accepted", "shipped", "out_for_delivery",
        "rejected", "completed", "cancelled",
      ],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

// Original indexes (unchanged)
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ "items.trader": 1, createdAt: -1 });
OrderSchema.index({ paymentMethod: 1, paymentStatus: 1, createdAt: -1 });

// Only one paid order may claim the same non-empty transaction ID.
// Check for existing duplicates before creating this index in production.
OrderSchema.index(
  { shamCashTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      shamCashTransactionId: { $type: "string" },
    },
  }
);

const Order = mongoose.model("Order", OrderSchema);

function validateCreateOrder(obj) {
  const schema = Joi.object({
    userId: Joi.string().required(),
    address: Joi.string().trim().min(5).max(500).required(),
    phone: Joi.string().trim().min(6).max(30).required(),
    paymentMethod: Joi.string()
      .valid("cash_on_delivery", "sham_cash_wallet")
      .required(),

    // Invoice is created first; no transaction ID required at checkout.
    // Keep optional input for compatibility with the existing controller.
    transactionId: Joi.string().trim().allow(null, "").optional(),

    items: Joi.array()
      .items(
        Joi.object({
          adId: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
          selectedColor: Joi.string().trim().allow(null, "").optional(),
          selectedSize: Joi.string()
            .valid("S", "M", "L", "XL")
            .allow(null, "")
            .optional(),
        })
      )
      .min(1)
      .required(),
  });

  return schema.validate(obj, { abortEarly: false });
}

module.exports = { Order, validateCreateOrder };
