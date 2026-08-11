const mongoose = require("mongoose");
const Joi = require("joi");

// ===============================
// Allowed Categories
// ===============================
const allowedCategories = [
  "cars",
];

// ===============================
// Trader Ad Schema
// ===============================
const TraderAdSchema = new mongoose.Schema(
  {
    trader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trader",
      required: true,
      index: true,
    },

    category: {
      type: String,
      required: true,
      enum: allowedCategories,
      trim: true,
      index: true,
    },

    adType: {
      type: String,
      required: true,
      enum: ["product", "service"],
      default: "product",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },

    image: {
      type: String,
      required: true,
      trim: true,
    },

    video: {
      type: String,
      trim: true,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ===============================
// Indexes
// ===============================
TraderAdSchema.index({
  category: 1,
  isActive: 1,
  createdAt: -1,
});

TraderAdSchema.index({
  trader: 1,
  isActive: 1,
  createdAt: -1,
});

TraderAdSchema.index({
  price: 1,
  createdAt: -1,
});

TraderAdSchema.index({
  title: "text",
  description: "text",
});

TraderAdSchema.index({
  createdAt: -1,
  _id: -1,
});

// ===============================
// Model
// ===============================
const TraderAd = mongoose.model(
  "TraderAd",
  TraderAdSchema
);

// ===============================
// Validation
// ===============================
function validateCreateTraderAd(obj) {
  const schema = Joi.object({
    category: Joi.string()
      .valid(...allowedCategories)
      .required(),

    adType: Joi.string()
      .valid("product", "service")
      .default("product")
      .required(),

    title: Joi.string()
      .trim()
      .min(3)
      .max(200)
      .required(),

    description: Joi.string()
      .trim()
      .min(5)
      .max(2000)
      .required(),

    price: Joi.number()
      .min(0)
      .required(),
  });

  return schema.validate(obj, {
    abortEarly: false,
  });
}

module.exports = {
  TraderAd,
  validateCreateTraderAd,
  allowedCategories,
};