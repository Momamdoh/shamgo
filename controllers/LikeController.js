// controllers/likeController.js
const asyncHandler = require("express-async-handler");
const Like = require("../models/Like");

// @desc Like or Dislike a driver
// @route POST /api/likes
const likeOrDislikeDriver = asyncHandler(async (req, res) => {
  const { userId, driverId, status } = req.body;

  if (!["like", "dislike"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value. Use 'like' or 'dislike'." });
  }

  // ابحث إذا كان المستخدم عمل تقييم قبل كده
  const existing = await Like.findOne({ user: userId, driver: driverId });

  if (existing) {
    existing.status = status;
    await existing.save();
    return res.status(200).json({ message: "Status updated", like: existing });
  }

  // لو ماعملش قبل كده
  const like = await Like.create({ user: userId, driver: driverId, status });
  res.status(201).json({ message: "Status created", like });
});

// @desc Get like/dislike stats for a driver
// @route GET /api/likes/driver/:driverId
const getDriverLikes = asyncHandler(async (req, res) => {
  const driverId = req.params.driverId;

  const likes = await Like.countDocuments({ driver: driverId, status: "like" });
  const dislikes = await Like.countDocuments({ driver: driverId, status: "dislike" });

  res.status(200).json({ driverId, likes, dislikes });
});

module.exports = {
  likeOrDislikeDriver,
  getDriverLikes
};
