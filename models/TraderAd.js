const mongoose = require("mongoose");
const Joi = require("joi");

// ===============================
// Allowed Categories
// ===============================
const allowedCategories = [
  "taxi",              // 1 تكسي
  "restaurants",       // 2 مطاعم
  "sweets",            // 3 حلويات
  "grocery",           // 4 بقاليات
  "pharmacy",          // 5 صيدليات
  "makeup",            // 6 مكياج
  "clothes",           // 7 ملابس
  "home_supplies",     // 8 مستلزمات بيت
  "hotels",            // 9 حجز فنادق
  "bus_booking",       // 10 حجز بولمنات
  "dress_rental",      // 11 استئجار فساتين
  "car_rental",        // 12 استئجار سيارات
  "gifts",             // 13 هدايا
  "party_decoration",  // 14 زينة حفلات ومناسبات
];

// ===============================
// Allowed Sizes
// ===============================
const allowedSizes = [
  "S",
  "M",
  "L",
  "XL",
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

    // ===============================
    // Colors
    // clothes + dress_rental + makeup
    // ===============================
    colors: {
      type: [String],
      default: [],
    },

    // ===============================
    // Sizes
    // clothes + dress_rental only
    // ===============================
    sizes: {
      type: [
        {
          type: String,
          enum: allowedSizes,
        },
      ],
      default: [],
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

    colors: Joi.when("category", {
      is: Joi.valid(
        "clothes",
        "dress_rental",
        "makeup"
      ),
      then: Joi.array()
        .items(
          Joi.string()
            .trim()
            .min(1)
            .max(50)
        )
        .unique()
        .default([]),
      otherwise: Joi.array()
        .max(0)
        .default([]),
    }),

    sizes: Joi.when("category", {
      is: Joi.valid(
        "clothes",
        "dress_rental"
      ),
      then: Joi.array()
        .items(
          Joi.string().valid(...allowedSizes)
        )
        .unique()
        .default([]),
      otherwise: Joi.array()
        .max(0)
        .default([]),
    }),
  });

  return schema.validate(obj, {
    abortEarly: false,
  });
}

module.exports = {
  TraderAd,
  validateCreateTraderAd,
  allowedCategories,
  allowedSizes,
};