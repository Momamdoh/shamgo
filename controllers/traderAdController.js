const asyncHandler = require("express-async-handler");
const admin = require("../config/firebase");
const { Trader } = require("../models/Trader");
const {
  TraderAd,
  validateCreateTraderAd,
  allowedCategories,
} = require("../models/TraderAd");
const { User } = require("../models/User");

// ===============================
// Pagination Helper
// ===============================
const getPagination = (query) => {
  const page = Math.max(
    parseInt(query.page || "1", 10),
    1
  );

  const limit = Math.min(
    Math.max(
      parseInt(query.limit || "15", 10),
      1
    ),
    50
  );

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

// ===============================
// Create Trader Ad
// ===============================
const createTraderAd = asyncHandler(
  async (req, res) => {
    const {
      traderId,
      category,
      adType,
      title,
      description,
      price,
    } = req.body;

    // ===============================
    // Parse Colors & Sizes
    // ===============================
    let colors = [];
    let sizes = [];

    try {
      if (req.body.colors) {
        colors = Array.isArray(req.body.colors)
          ? req.body.colors
          : JSON.parse(req.body.colors);
      }
    } catch (e) {
      colors = [];
    }

    try {
      if (req.body.sizes) {
        sizes = Array.isArray(req.body.sizes)
          ? req.body.sizes
          : JSON.parse(req.body.sizes);
      }
    } catch (e) {
      sizes = [];
    }

    // ===============================
    // Validation
    // ===============================
    const errors = {};

    if (!traderId) {
      errors.traderId =
        "معرف التاجر مطلوب";
    }

    const { error } =
      validateCreateTraderAd({
        category,
        adType,
        title,
        description,
        price,
        colors,
        sizes,
      });

    if (error) {
      error.details.forEach(
        (item) => {
          errors[item.path[0]] =
            item.message;
        }
      );
    }

    if (!req.savedImage) {
      errors.image =
        "صورة الإعلان مطلوبة";
    }

    if (
      req.savedVideo?.duration &&
      req.savedVideo.duration > 10
    ) {
      errors.video =
        "مدة الفيديو يجب ألا تزيد عن 10 ثواني";
    }

    if (
      Object.keys(errors).length > 0
    ) {
      return res.status(200).json({
        status: "fail",
        message: errors,
      });
    }

    // ===============================
    // Trader
    // ===============================
    const trader =
      await Trader.findById(
        traderId
      );

    if (!trader) {
      return res.status(404).json({
        status: "fail",
        message:
          "التاجر غير موجود",
      });
    }

    // ===============================
    // Security:
    // Trader Can Only Post
    // In His Category
    // ===============================
    if (
      trader.category &&
      trader.category !== category
    ) {
      return res.status(403).json({
        status: "fail",
        message:
          "غير مسموح لك بإضافة إعلان في قسم آخر",
      });
    }

    // ===============================
    // Category Options
    // ===============================

    // Clothes / Dress Rental
    if (
      category === "clothes" ||
      category === "dress_rental"
    ) {
      colors = colors
        .map((e) =>
          e.toString().trim()
        )
        .filter(Boolean);

      sizes = sizes
        .map((e) =>
          e.toString().trim()
        )
        .filter(Boolean);
    }

    // Makeup => Colors Only
    else if (
      category === "makeup"
    ) {
      colors = colors
        .map((e) =>
          e.toString().trim()
        )
        .filter(Boolean);

      sizes = [];
    }

    // Other Categories
    else {
      colors = [];
      sizes = [];
    }

    // ===============================
    // Create Ad
    // ===============================
    const ad =
      new TraderAd({
        trader:
          trader._id,

        category,

        adType,

        title,

        description,

        price,

        colors,

        sizes,

        image:
          req.savedImage.imagePath,

        video:
          req.savedVideo
            ? req.savedVideo.videoPath
            : null,
      });

    await ad.save();

    console.log(
      "✅ AD SAVED =>",
      ad._id.toString()
    );

    console.log(
      "✅ COLORS =>",
      colors
    );

    console.log(
      "✅ SIZES =>",
      sizes
    );

    // ===============================
    // IMPORTANT:
    // Send Response Immediately
    // ===============================
    res.status(201).json({
      status: "success",

      message:
        "تم إنشاء الإعلان بنجاح",

      data: ad,
    });

    // ===============================
    // Notifications
    // Don't Await
    // ===============================
    try {
      const users =
        await User.find({
          fcmToken: {
            $exists: true,
            $nin: [
              null,
              "",
            ],
          },
        }).select(
          "fcmToken"
        );

      const tokens =
        users
          .map(
            (user) =>
              user.fcmToken
          )
          .filter(Boolean);

      if (
        tokens.length > 0
      ) {
        const message = {
          notification: {
            title:
              "إعلان جديد",

            body:
              `${title} - ${price} جنيه`,
          },

          data: {
            route:
              "/ads",

            type:
              "new_ad",

            adId:
              ad._id.toString(),

            traderId:
              trader._id.toString(),

            traderName:
              trader.name
                ?.toString() ||
              "",

            traderPhone:
              trader.phone
                ?.toString() ||
              "",

            traderEmail:
              trader.email
                ?.toString() ||
              "",

            institutionName:
              trader
                .institutionName
                ?.toString() ||
              "",

            category:
              category
                ?.toString() ||
              "",

            adType:
              ad.adType
                ?.toString() ||
              "product",

            title:
              title
                ?.toString() ||
              "",

            description:
              description
                ?.toString() ||
              "",

            price:
              price
                ?.toString() ||
              "",

            image:
              ad.image
                ?.toString() ||
              "",

            video:
              ad.video
                ?.toString() ||
              "",
          },

          tokens,
        };

        admin
          .messaging()
          .sendEachForMulticast(
            message
          )
          .then(
            (result) => {
              console.log(
                "✅ Notifications sent:",
                result.successCount
              );

              console.log(
                "❌ Notifications failed:",
                result.failureCount
              );
            }
          )
          .catch(
            (err) => {
              console.error(
                "❌ فشل إرسال إشعارات الإعلان:",
                err
              );
            }
          );
      }
    } catch (err) {
      console.error(
        "❌ Notification setup error:",
        err
      );
    }
  }
);

// ===============================
// Get Trader Ads
// ===============================
const getTraderAds = asyncHandler(
  async (req, res) => {
    const { traderId } =
      req.params;

    const {
      limit,
      skip,
    } = getPagination(
      req.query
    );

    const trader =
      await Trader.findById(
        traderId
      ).select("_id");

    if (!trader) {
      return res
        .status(404)
        .json([]);
    }

    const ads =
      await TraderAd.find({
        trader: traderId,
        isActive: true,
      })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .populate(
          "trader",
          "name phone email institutionName"
        )
        .lean();

    return res
      .status(200)
      .json(ads);
  }
);

// ===============================
// Get Ads By Category
// ===============================
const getAdsByCategory =
  asyncHandler(
    async (req, res) => {
      const { category } =
        req.params;

      const {
        limit,
        skip,
      } = getPagination(
        req.query
      );

      if (
        !allowedCategories.includes(
          category
        )
      ) {
        return res
          .status(400)
          .json({
            status: "fail",
            message:
              "تصنيف الإعلان غير صحيح",
          });
      }

      const ads =
        await TraderAd.find({
          category,
          isActive: true,
        })
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .populate(
            "trader",
            "name phone email institutionName"
          )
          .lean();

      return res
        .status(200)
        .json(ads);
    }
  );

// ===============================
// Get Single Trader Ad
// ===============================
const getSingleTraderAd =
  asyncHandler(
    async (req, res) => {
      const { adId } =
        req.params;

      const ad =
        await TraderAd.findById(
          adId
        )
          .populate(
            "trader",
            "name phone email institutionName"
          )
          .lean();

      if (!ad) {
        return res
          .status(404)
          .json({
            status: "fail",
            message:
              "الإعلان غير موجود",
          });
      }

      return res
        .status(200)
        .json({
          status: "success",
          data: ad,
        });
    }
  );

// ===============================
// Update Trader Ad
// ===============================
const updateTraderAd =
  asyncHandler(
    async (req, res) => {
      const { adId } =
        req.params;

      const {
        traderId,
        category,
        adType,
        title,
        description,
        price,
        colors = [],
        sizes = [],
      } = req.body;

      const errors = {};

      if (!traderId) {
        errors.traderId =
          "معرف التاجر مطلوب";
      }

      const { error, value } =
        validateCreateTraderAd({
          category,
          adType,
          title,
          description,
          price,
          colors,
          sizes,
        });

      if (error) {
        error.details.forEach(
          (item) => {
            errors[item.path[0]] =
              item.message;
          }
        );
      }

      if (
        req.savedVideo?.duration &&
        req.savedVideo.duration > 10
      ) {
        errors.video =
          "مدة الفيديو يجب ألا تزيد عن 10 ثواني";
      }

      if (
        Object.keys(errors).length > 0
      ) {
        return res
          .status(200)
          .json({
            status: "fail",
            message: errors,
          });
      }

      const trader =
        await Trader.findById(
          traderId
        ).select("_id");

      if (!trader) {
        return res
          .status(404)
          .json({
            status: "fail",
            message:
              "التاجر غير موجود",
          });
      }

      const ad =
        await TraderAd.findById(
          adId
        );

      if (!ad) {
        return res
          .status(404)
          .json({
            status: "fail",
            message:
              "الإعلان غير موجود",
          });
      }

      if (
        ad.trader.toString() !==
        traderId.toString()
      ) {
        return res
          .status(403)
          .json({
            status: "fail",
            message:
              "غير مسموح لك بتعديل هذا الإعلان",
          });
      }

      ad.category =
        value.category;

      ad.adType =
        value.adType;

      ad.title =
        value.title;

      ad.description =
        value.description;

      ad.price =
        value.price;

      ad.colors =
        value.colors || [];

      ad.sizes =
        value.sizes || [];

      if (req.savedImage) {
        ad.image =
          req.savedImage.imagePath;
      }

      if (req.savedVideo) {
        ad.video =
          req.savedVideo.videoPath;
      }

      await ad.save();

      return res
        .status(200)
        .json({
          status: "success",
          message:
            "تم تعديل الإعلان بنجاح",
          data: ad,
        });
    }
  );
// ===============================
// Delete Trader Ad
// ===============================
const deleteTraderAd =
  asyncHandler(
    async (req, res) => {
      const { adId } =
        req.params;

      const { traderId } =
        req.body;

      if (!traderId) {
        return res
          .status(200)
          .json({
            status: "fail",
            message: {
              traderId:
                "معرف التاجر مطلوب",
            },
          });
      }

      const trader =
        await Trader.findById(
          traderId
        ).select("_id");

      if (!trader) {
        return res
          .status(404)
          .json({
            status: "fail",
            message:
              "التاجر غير موجود",
          });
      }

      const ad =
        await TraderAd.findById(
          adId
        );

      if (!ad) {
        return res
          .status(404)
          .json({
            status: "fail",
            message:
              "الإعلان غير موجود",
          });
      }

      if (
        ad.trader.toString() !==
        traderId.toString()
      ) {
        return res
          .status(403)
          .json({
            status: "fail",
            message:
              "غير مسموح لك بحذف هذا الإعلان",
          });
      }

      await TraderAd
        .findByIdAndDelete(
          adId
        );

      return res
        .status(200)
        .json({
          status: "success",
          message:
            "تم حذف الإعلان بنجاح",
        });
    }
  );

// ===============================
// Search Trader Ads
// ===============================
const searchTraderAds =
  asyncHandler(
    async (req, res) => {
      const {
        page,
        limit,
        skip,
      } = getPagination(
        req.query
      );

      const query =
        req.query.query
          ? req.query.query
              .toString()
              .trim()
          : "";

      const category =
        req.query.category
          ? req.query.category
              .toString()
          : "all";

      const adType =
        req.query.adType
          ? req.query.adType
              .toString()
          : "all";

      const sort =
        req.query.sort
          ? req.query.sort
              .toString()
          : "none";

      const filter = {
        isActive: true,
      };

      // ===============================
      // Category Filter
      // ===============================
      if (
        category &&
        category !== "all"
      ) {
        if (
          !allowedCategories.includes(
            category
          )
        ) {
          return res
            .status(400)
            .json({
              status: "fail",
              message:
                "تصنيف الإعلان غير صحيح",
            });
        }

        filter.category =
          category;
      }

      // ===============================
      // Ad Type Filter
      // ===============================
      if (
        adType &&
        adType !== "all"
      ) {
        if (
          ![
            "product",
            "service",
          ].includes(adType)
        ) {
          return res
            .status(400)
            .json({
              status: "fail",
              message:
                "نوع الإعلان غير صحيح",
            });
        }

        filter.adType =
          adType;
      }

      // ===============================
      // Search
      // ===============================
      if (query) {
        const regex =
          new RegExp(
            query,
            "i"
          );

        filter.$or = [
          {
            title: regex,
          },
          {
            description:
              regex,
          },
          {
            category: regex,
          },
        ];

        const numericPrice =
          Number(query);

        if (
          !Number.isNaN(
            numericPrice
          )
        ) {
          filter.$or.push({
            price:
              numericPrice,
          });
        }
      }

      // ===============================
      // Sort
      // ===============================
      let sortQuery = {
        createdAt: -1,
      };

      if (sort === "low") {
        sortQuery = {
          price: 1,
          createdAt: -1,
        };
      }

      if (sort === "high") {
        sortQuery = {
          price: -1,
          createdAt: -1,
        };
      }

      const ads =
        await TraderAd.find(
          filter
        )
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .populate(
            "trader",
            "name phone email institutionName"
          )
          .lean();

      return res
        .status(200)
        .json({
          status: "success",
          page,
          limit,
          count:
            ads.length,
          hasMore:
            ads.length ===
            limit,
          ads,
        });
    }
  );

// ===============================
// Exports
// ===============================
module.exports = {
  createTraderAd,
  getTraderAds,
  getAdsByCategory,
  getSingleTraderAd,
  updateTraderAd,
  deleteTraderAd,
  searchTraderAds,
};