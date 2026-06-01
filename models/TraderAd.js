const mongoose = require("mongoose");
const Joi = require("joi");

const allowedCategories = [
  "pharmacy",
  "hotels",
  "restraurnt",
  "other",
  "sweets",
  "market",
  "polmn",
];

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
  },
);

// Main indexes
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

// Fast pagination indexes
TraderAdSchema.index({
  createdAt: -1,
  _id: -1,
});

const TraderAd = mongoose.model("TraderAd", TraderAdSchema);

function validateCreateTraderAd(obj) {
  const schema = Joi.object({
    category: Joi.string()
      .valid(
        "pharmacy",
        "hotels",
        "restraurnt",
        "other",
        "sweets",
        "market",
        "polmn",
      )
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