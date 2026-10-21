const { Favorite } = require("../models/Favorite");

// إضافة للمفضلة
const addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const adId = req.params.adId;

    const existingFavorite = await Favorite.findOne({
      user: userId,
      ad: adId,
    });

    if (existingFavorite) {
      return res.status(400).json({
        message: "Product already in favorites",
      });
    }

    const favorite = await Favorite.create({
      user: userId,
      ad: adId,
    });

    return res.status(201).json({
      message: "Added to favorites successfully",
      favorite,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// حذف من المفضلة
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const adId = req.params.adId;

    const favorite = await Favorite.findOneAndDelete({
      user: userId,
      ad: adId,
    });

    if (!favorite) {
      return res.status(404).json({
        message: "Favorite not found",
      });
    }

    return res.status(200).json({
      message: "Removed from favorites successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// عرض مفضلة المستخدم
const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    const favorites = await Favorite.find({
      user: userId,
    })
      .populate({
        path: "ad",
        populate: {
          path: "trader",
        },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      favorites,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// جلب عدد الإعجابات لإعلان معين
const getAdFavoriteCount = async (req, res) => {
  try {
    const adId = req.params.adId;

    const favoriteCount = await Favorite.countDocuments({
      ad: adId,
    });

    return res.status(200).json({
      favoriteCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  getAdFavoriteCount,
};