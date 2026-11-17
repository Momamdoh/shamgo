const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Trader } = require("../models/Trader");
const { User } = require("../models/User");
const TraderRating = require("../models/TraderRating");

const validId = (value) => mongoose.isValidObjectId(value);

async function getRatingSummary(traderId) {
  const [result] = await TraderRating.aggregate([
    { $match: { trader: new mongoose.Types.ObjectId(traderId) } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        ratingsCount: { $sum: 1 },
      },
    },
  ]);

  return {
    averageRating: Number((result?.averageRating ?? 0).toFixed(1)),
    ratingsCount: result?.ratingsCount ?? 0,
  };
}

async function ensureTrader(req, res) {
  const { traderId } = req.params;
  if (!validId(traderId)) {
    res.status(400).json({ status: "fail", message: "معرف التاجر غير صحيح" });
    return false;
  }
  if (!(await Trader.exists({ _id: traderId }))) {
    res.status(404).json({ status: "fail", message: "التاجر غير موجود" });
    return false;
  }
  return true;
}

async function getAuthenticatedUserId(req, res) {
  // auth.js places the decoded JWT payload in req.user; User.js signs {id, role, isAdmin}.
  const userId = req.user?.id;
  if (req.user?.role !== "user" || !validId(userId)) {
    res.status(403).json({ status: "fail", message: "التقييم متاح للمستخدمين فقط" });
    return null;
  }
  if (!(await User.exists({ _id: userId }))) {
    res.status(403).json({ status: "fail", message: "حساب المستخدم غير موجود" });
    return null;
  }
  return userId;
}

// GET /api/trader-ratings/:traderId (public, no customer details)
const getTraderRating = asyncHandler(async (req, res) => {
  if (!(await ensureTrader(req, res))) return;
  return res.status(200).json({
    status: "success",
    traderId: req.params.traderId,
    ...(await getRatingSummary(req.params.traderId)),
  });
});

// GET /api/trader-ratings/:traderId/mine (authenticated user)
const getMyTraderRating = asyncHandler(async (req, res) => {
  const userId = await getAuthenticatedUserId(req, res);
  if (!userId || !(await ensureTrader(req, res))) return;

  const entry = await TraderRating.findOne({
    trader: req.params.traderId,
    user: userId,
  }).select("rating -_id").lean();

  return res.status(200).json({
    status: "success",
    traderId: req.params.traderId,
    myRating: entry?.rating ?? null,
  });
});

// POST /api/trader-ratings/:traderId (authenticated user)
const rateTrader = asyncHandler(async (req, res) => {
  const userId = await getAuthenticatedUserId(req, res);
  if (!userId || !(await ensureTrader(req, res))) return;

  const rating = req.body?.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      status: "fail",
      message: "التقييم يجب أن يكون رقمًا صحيحًا من 1 إلى 5",
    });
  }

  const filter = { trader: req.params.traderId, user: userId };
  try {
    await TraderRating.findOneAndUpdate(
      filter,
      { $set: { rating } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    // In case two requests race to insert, update the single existing record.
    await TraderRating.updateOne(filter, { $set: { rating } }, { runValidators: true });
  }

  return res.status(200).json({
    status: "success",
    traderId: req.params.traderId,
    myRating: rating,
    ...(await getRatingSummary(req.params.traderId)),
  });
});

module.exports = {
  getTraderRating,
  getMyTraderRating,
  rateTrader,
};
