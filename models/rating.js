const mongoose = require("mongoose");
const Joi = require("joi");

// ===============================
// Rating Schema
// ===============================
const RatingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    ad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TraderAd",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

// ===============================
// One rating per user per ad
// ===============================
RatingSchema.index(
  {
    user: 1,
    ad: 1,
  },
  {
    unique: true,
  }
);

// ===============================
// Useful index
// ===============================
RatingSchema.index({
  ad: 1,
  createdAt: -1,
});

// ===============================
// Model
// ===============================
const Rating = mongoose.model(
  "Rating",
  RatingSchema
);

// ===============================
// Validation
// ===============================
function validateRating(obj) {
  const schema = Joi.object({
    ad: Joi.string()
      .hex()
      .length(24)
      .required(),

    rating: Joi.number()
      .min(1)
      .max(5)
      .required(),
  });

  return schema.validate(obj);
}

module.exports = {
  Rating,
  validateRating,
};