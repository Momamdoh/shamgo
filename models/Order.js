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
    title: String,
    image: String,
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
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

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ user: 1, createdAt: -1 });

const Order = mongoose.model("Order", OrderSchema);

function validateCreateOrder(obj) {
  const schema = Joi.object({
    userId: Joi.string().required(),

    address: Joi.string().trim().min(5).max(500).required(),

    phone: Joi.string().trim().min(6).max(30).required(),

    items: Joi.array()
      .items(
        Joi.object({
          adId: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
        })
      )
      .min(1)
      .required(),
  });

  return schema.validate(obj, { abortEarly: false });
}

module.exports = {
  Order,
  validateCreateOrder,
};