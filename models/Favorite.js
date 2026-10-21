const mongoose = require("mongoose");
const Joi = require("joi");

// ===============================
// Favorite Schema
// ===============================
const FavoriteSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
);

// ===============================
// Prevent duplicate favorite
// نفس المستخدم لا يعمل إعجاب
// لنفس المنتج أكثر من مرة
// ===============================
FavoriteSchema.index(
  {
    user: 1,
    ad: 1,
  },
  {
    unique: true,
  }
);

// ===============================
// Model
// ===============================
const Favorite = mongoose.model(
  "Favorite",
  FavoriteSchema
);

// ===============================
// Validation
// ===============================
function validateFavorite(obj) {
  const schema = Joi.object({
    ad: Joi.string()
      .hex()
      .length(24)
      .required(),
  });

  return schema.validate(obj);
}

module.exports = {
  Favorite,
  validateFavorite,
};