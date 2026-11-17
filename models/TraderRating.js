const mongoose = require('mongoose');

// A user can rate the same trader once, and update that rating later.
const traderRatingSchema = new mongoose.Schema(
  {
    trader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trader',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number between 1 and 5',
      },
    },
  },
  { timestamps: true },
);

// Enforced by MongoDB (ensure indexes are built in production).
traderRatingSchema.index({ trader: 1, user: 1 }, { unique: true });

module.exports =
  mongoose.models.TraderRating ||
  mongoose.model('TraderRating', traderRatingSchema);
