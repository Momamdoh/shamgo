const { Rating } = require("../models/Rating");

// إضافة أو تعديل تقييم
const addOrUpdateRating = async (req, res) => {
  try {
    const userId = req.user.id;
    const adId = req.params.adId;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    const userRating = await Rating.findOneAndUpdate(
      {
        user: userId,
        ad: adId,
      },
      {
        rating,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      message: "Rating saved successfully",
      rating: userRating,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// جلب تقييم المنتج
const getAdRating = async (req, res) => {
  try {
    const adId = req.params.adId;

    const ratings = await Rating.find({
      ad: adId,
    });

    if (ratings.length === 0) {
      return res.status(200).json({
        averageRating: 0,
        totalRatings: 0,
      });
    }

    const total = ratings.reduce(
      (sum, item) => sum + item.rating,
      0
    );

    const averageRating = total / ratings.length;

    return res.status(200).json({
      averageRating: Number(averageRating.toFixed(1)),
      totalRatings: ratings.length,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  addOrUpdateRating,
  getAdRating,
};