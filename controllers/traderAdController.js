const asyncHandler = require("express-async-handler");
const admin = require("../config/firebase");
const { Trader } = require("../models/Trader");
const { TraderAd, validateCreateTraderAd } = require("../models/TraderAd");
const { User } = require("../models/User");

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || "15", 10), 1), 50);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const createTraderAd = asyncHandler(async (req, res) => {
  const { traderId, category, title, description, price } = req.body;

  const errors = {};

  if (!traderId) {
    errors.traderId = "معرف التاجر مطلوب";
  }

  const { error } = validateCreateTraderAd({
    category,
    title,
    description,
    price,
  });

  if (error) {
    error.details.forEach((item) => {
      errors[item.path[0]] = item.message;
    });
  }

  if (!req.savedImage) {
    errors.image = "صورة الإعلان مطلوبة";
  }

  if (req.savedVideo?.duration && req.savedVideo.duration > 10) {
    errors.video = "مدة الفيديو يجب ألا تزيد عن 10 ثواني";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(200).json({
      status: "fail",
      message: errors,
    });
  }

  const trader = await Trader.findById(traderId);

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  const ad = new TraderAd({
    trader: trader._id,
    category,
    title,
    description,
    price,
    image: req.savedImage.imagePath,
    video: req.savedVideo ? req.savedVideo.videoPath : null,
  });

  await ad.save();

  const users = await User.find({
    fcmToken: { $exists: true, $nin: [null, ""] },
  }).select("fcmToken");

  const tokens = users.map((user) => user.fcmToken).filter(Boolean);

  if (tokens.length) {
    const message = {
      notification: {
        title: "إعلان جديد",
        body: `${title} - ${price} جنيه`,
      },
      data: {
        route: "/ads",
        type: "new_ad",
        adId: ad._id.toString(),
        traderId: trader._id.toString(),
        traderName: trader.name?.toString() || "",
        traderPhone: trader.phone?.toString() || "",
        traderEmail: trader.email?.toString() || "",
        institutionName: trader.institutionName?.toString() || "",
        category: category?.toString() || "",
        title: title?.toString() || "",
        description: description?.toString() || "",
        price: price?.toString() || "",
        image: ad.image?.toString() || "",
        video: ad.video?.toString() || "",
      },
      tokens,
    };

    try {
      await admin.messaging().sendEachForMulticast(message);
    } catch (err) {
      console.error("❌ فشل في إرسال إشعارات الإعلان:", err);
    }
  }

  return res.status(201).json({
    status: "success",
    message: "تم إنشاء الإعلان وإرسال الإشعارات بنجاح",
    data: ad,
  });
});

const getTraderAds = asyncHandler(async (req, res) => {
  const { traderId } = req.params;
  const { limit, skip } = getPagination(req.query);

  const trader = await Trader.findById(traderId).select("_id");

  if (!trader) {
    return res.status(404).json([]);
  }

  const ads = await TraderAd.find({ trader: traderId, isActive: true })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName")
    .lean();

  return res.status(200).json(ads);
});

const getAdsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { limit, skip } = getPagination(req.query);

  const ads = await TraderAd.find({ category, isActive: true })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName")
    .lean();

  return res.status(200).json(ads);
});

const getSingleTraderAd = asyncHandler(async (req, res) => {
  const { adId } = req.params;

  const ad = await TraderAd.findById(adId)
    .populate("trader", "name phone email institutionName")
    .lean();

  if (!ad) {
    return res.status(404).json({
      status: "fail",
      message: "الإعلان غير موجود",
    });
  }

  return res.status(200).json({
    status: "success",
    data: ad,
  });
});

const updateTraderAd = asyncHandler(async (req, res) => {
  const { adId } = req.params;
  const { traderId, category, title, description, price } = req.body;

  const errors = {};

  if (!traderId) {
    errors.traderId = "معرف التاجر مطلوب";
  }

  const { error } = validateCreateTraderAd({
    category,
    title,
    description,
    price,
  });

  if (error) {
    error.details.forEach((item) => {
      errors[item.path[0]] = item.message;
    });
  }

  if (req.savedVideo?.duration && req.savedVideo.duration > 10) {
    errors.video = "مدة الفيديو يجب ألا تزيد عن 10 ثواني";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(200).json({
      status: "fail",
      message: errors,
    });
  }

  const trader = await Trader.findById(traderId).select("_id");

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  const ad = await TraderAd.findById(adId);

  if (!ad) {
    return res.status(404).json({
      status: "fail",
      message: "الإعلان غير موجود",
    });
  }

  if (ad.trader.toString() !== traderId.toString()) {
    return res.status(403).json({
      status: "fail",
      message: "غير مسموح لك بتعديل هذا الإعلان",
    });
  }

  ad.category = category;
  ad.title = title;
  ad.description = description;
  ad.price = price;

  if (req.savedImage) {
    ad.image = req.savedImage.imagePath;
  }

  if (req.savedVideo) {
    ad.video = req.savedVideo.videoPath;
  }

  await ad.save();

  return res.status(200).json({
    status: "success",
    message: "تم تعديل الإعلان بنجاح",
    data: ad,
  });
});

const deleteTraderAd = asyncHandler(async (req, res) => {
  const { adId } = req.params;
  const { traderId } = req.body;

  if (!traderId) {
    return res.status(200).json({
      status: "fail",
      message: {
        traderId: "معرف التاجر مطلوب",
      },
    });
  }

  const trader = await Trader.findById(traderId).select("_id");

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  const ad = await TraderAd.findById(adId);

  if (!ad) {
    return res.status(404).json({
      status: "fail",
      message: "الإعلان غير موجود",
    });
  }

  if (ad.trader.toString() !== traderId.toString()) {
    return res.status(403).json({
      status: "fail",
      message: "غير مسموح لك بحذف هذا الإعلان",
    });
  }

  await TraderAd.findByIdAndDelete(adId);

  return res.status(200).json({
    status: "success",
    message: "تم حذف الإعلان بنجاح",
  });
});

const searchTraderAds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const query = req.query.query ? req.query.query.toString().trim() : "";
  const category = req.query.category ? req.query.category.toString() : "all";
  const sort = req.query.sort ? req.query.sort.toString() : "none";

  const filter = {
    isActive: true,
  };

  if (category && category !== "all") {
    filter.category = category;
  }

  if (query) {
    const regex = new RegExp(query, "i");

    filter.$or = [
      { title: regex },
      { description: regex },
      { category: regex },
      { price: regex },
    ];
  }

  let sortQuery = { createdAt: -1 };

  if (sort === "low") {
    sortQuery = { price: 1 };
  }

  if (sort === "high") {
    sortQuery = { price: -1 };
  }

  const ads = await TraderAd.find(filter)
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName")
    .lean();

  return res.status(200).json({
    status: "success",
    page,
    limit,
    count: ads.length,
    hasMore: ads.length === limit,
    ads,
  });
});

module.exports = {
  createTraderAd,
  getTraderAds,
  getAdsByCategory,
  getSingleTraderAd,
  updateTraderAd,
  deleteTraderAd,
  searchTraderAds,
};