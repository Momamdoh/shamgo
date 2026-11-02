const asyncHandler = require("express-async-handler");
const admin = require("../config/firebase");
const { Trader } = require("../models/Trader");

const {
  TraderAd,
  validateCreateTraderAd,
  allowedCategories,
  allowedMakeupTypes,
} = require("../models/TraderAd");

const { User } = require("../models/User");

// ===============================
// Pagination Helper
// ===============================
const getPagination = (query) => {
  const page = Math.max(parseInt(query.page || "1", 10), 1);

  const limit = Math.min(Math.max(parseInt(query.limit || "15", 10), 1), 50);

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
const createTraderAd = asyncHandler(async (req, res) => {
  const { traderId, category, adType, makeupType, title, description, price } =
    req.body;

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
    errors.traderId = "معرف التاجر مطلوب";
  }

  const { error, value } = validateCreateTraderAd({
    category,
    adType,
    makeupType: category === "makeup" ? makeupType : null,
    title,
    description,
    price,
    colors,
    sizes,
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

  // ===============================
  // Trader
  // ===============================
  const trader = await Trader.findById(traderId);

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  // ===============================
  // Security:
  // Trader Can Only Post
  // In His Category
  // ===============================
  if (trader.category && trader.category !== category) {
    return res.status(403).json({
      status: "fail",
      message: "غير مسموح لك بإضافة إعلان في قسم آخر",
    });
  }

  // ===============================
  // Normalize Makeup Type
  // ===============================
  const normalizedMakeupType = category === "makeup" ? value.makeupType : null;

  // ===============================
  // Category Options
  // ===============================

  // Clothes / Dress Rental
  if (category === "clothes" || category === "dress_rental") {
    colors = colors.map((e) => e.toString().trim()).filter(Boolean);

    sizes = sizes.map((e) => e.toString().trim()).filter(Boolean);
  }

  // Makeup => Colors Only
  else if (category === "makeup") {
    colors = colors.map((e) => e.toString().trim()).filter(Boolean);

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
  const ad = new TraderAd({
    trader: trader._id,

    category,

    adType,

    makeupType: normalizedMakeupType,

    title,

    description,

    price,

    colors,

    sizes,

    image: req.savedImage.imagePath,

    video: req.savedVideo ? req.savedVideo.videoPath : null,
  });

  await ad.save();

  console.log("✅ AD SAVED =>", ad._id.toString());

  console.log("✅ COLORS =>", colors);

  console.log("✅ SIZES =>", sizes);

  console.log("✅ MAKEUP TYPE =>", normalizedMakeupType);

  // ===============================
  // IMPORTANT:
  // Send Response Immediately
  // ===============================
  res.status(201).json({
    status: "success",

    message: "تم إنشاء الإعلان بنجاح",

    data: ad,
  });

  // ===============================
  // Notifications
  // Don't Await
  // ===============================
  try {
    const users = await User.find({
      fcmToken: {
        $exists: true,
        $nin: [null, ""],
      },
    }).select("fcmToken");

    const tokens = users.map((user) => user.fcmToken).filter(Boolean);

    if (tokens.length > 0) {
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

          adType: ad.adType?.toString() || "product",

          makeupType: ad.makeupType?.toString() || "",

          title: title?.toString() || "",

          description: description?.toString() || "",

          price: price?.toString() || "",

          image: ad.image?.toString() || "",

          video: ad.video?.toString() || "",
        },

        tokens,
      };

      admin
        .messaging()
        .sendEachForMulticast(message)
        .then((result) => {
          console.log("✅ Notifications sent:", result.successCount);

          console.log("❌ Notifications failed:", result.failureCount);
        })
        .catch((err) => {
          console.error("❌ فشل إرسال إشعارات الإعلان:", err);
        });
    }
  } catch (err) {
    console.error("❌ Notification setup error:", err);
  }
});

// ===============================
// Get Trader Ads
// ===============================
const getTraderAds = asyncHandler(async (req, res) => {
  const { traderId } = req.params;

  const { limit, skip } = getPagination(req.query);

  const trader = await Trader.findById(traderId).select("_id");

  if (!trader) {
    return res.status(404).json([]);
  }

  const ads = await TraderAd.find({
    trader: traderId,
    isActive: true,
  })
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName image")
    .lean();

  return res.status(200).json(ads);
});

// ===============================
// Get Ads By Category
// ===============================
const getAdsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;

  const { limit, skip } = getPagination(req.query);

  const makeupType = req.query.makeupType
    ? req.query.makeupType.toString().trim()
    : "all";

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({
      status: "fail",
      message: "تصنيف الإعلان غير صحيح",
    });
  }

  const filter = {
    category,
    isActive: true,
  };

  // ===============================
  // Makeup Type Filter
  // ===============================
  if (category === "makeup" && makeupType && makeupType !== "all") {
    if (!allowedMakeupTypes.includes(makeupType)) {
      return res.status(400).json({
        status: "fail",
        message: "نوع المكياج غير صحيح",
      });
    }

    filter.makeupType = makeupType;
  }

  const ads = await TraderAd.find(filter)
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName image")
    .lean();

  return res.status(200).json(ads);
});

// ===============================
// Get Single Trader Ad
// ===============================
const getSingleTraderAd = asyncHandler(async (req, res) => {
  const { adId } = req.params;

  const ad = await TraderAd.findById(adId)
   .populate("trader", "name phone email institutionName image")
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

// ===============================
// Update Trader Ad
// ===============================
const updateTraderAd = asyncHandler(async (req, res) => {
  const { adId } = req.params;

  const { traderId, category, adType, makeupType, title, description, price } =
    req.body;

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

  const errors = {};

  if (!traderId) {
    errors.traderId = "معرف التاجر مطلوب";
  }

  const { error, value } = validateCreateTraderAd({
    category,
    adType,
    makeupType: category === "makeup" ? makeupType : null,
    title,
    description,
    price,
    colors,
    sizes,
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

  const trader = await Trader.findById(traderId).select("_id category");

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  if (trader.category && trader.category !== category) {
    return res.status(403).json({
      status: "fail",
      message: "غير مسموح لك بتعديل الإعلان إلى قسم آخر",
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

  // ===============================
  // Category Options
  // ===============================
  if (value.category === "clothes" || value.category === "dress_rental") {
    colors = (value.colors || [])
      .map((e) => e.toString().trim())
      .filter(Boolean);

    sizes = (value.sizes || []).map((e) => e.toString().trim()).filter(Boolean);
  } else if (value.category === "makeup") {
    colors = (value.colors || [])
      .map((e) => e.toString().trim())
      .filter(Boolean);

    sizes = [];
  } else {
    colors = [];
    sizes = [];
  }

  ad.category = value.category;

  ad.adType = value.adType;

  ad.makeupType = value.category === "makeup" ? value.makeupType : null;

  ad.title = value.title;

  ad.description = value.description;

  ad.price = value.price;

  ad.colors = colors;

  ad.sizes = sizes;

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

// ===============================
// Delete Trader Ad
// ===============================
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

// ===============================
// Search Trader Ads
// ===============================
const searchTraderAds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const query = req.query.query ? req.query.query.toString().trim() : "";

  const category = req.query.category ? req.query.category.toString() : "all";

  const adType = req.query.adType ? req.query.adType.toString() : "all";

  const makeupType = req.query.makeupType
    ? req.query.makeupType.toString().trim()
    : "all";

  const sort = req.query.sort ? req.query.sort.toString() : "none";

  const filter = {
    isActive: true,
  };

  // ===============================
  // Category Filter
  // ===============================
  if (category && category !== "all") {
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        status: "fail",
        message: "تصنيف الإعلان غير صحيح",
      });
    }

    filter.category = category;
  }

  // ===============================
  // Ad Type Filter
  // ===============================
  if (adType && adType !== "all") {
    if (!["product", "service"].includes(adType)) {
      return res.status(400).json({
        status: "fail",
        message: "نوع الإعلان غير صحيح",
      });
    }

    filter.adType = adType;
  }

  // ===============================
  // Makeup Type Filter
  // ===============================
  if (makeupType && makeupType !== "all") {
    if (!allowedMakeupTypes.includes(makeupType)) {
      return res.status(400).json({
        status: "fail",
        message: "نوع المكياج غير صحيح",
      });
    }

    filter.category = "makeup";

    filter.makeupType = makeupType;
  }

  // ===============================
  // Search
  // ===============================
  if (query) {
    const regex = new RegExp(query, "i");

    filter.$or = [
      {
        title: regex,
      },
      {
        description: regex,
      },
      {
        category: regex,
      },
      {
        makeupType: regex,
      },
    ];

    const numericPrice = Number(query);

    if (!Number.isNaN(numericPrice)) {
      filter.$or.push({
        price: numericPrice,
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

  const ads = await TraderAd.find(filter)
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .populate("trader", "name phone email institutionName image")
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


// ===============================
// TRADER SUBSCRIPTION FUNCTIONS (SHAM CASH INVOICES)
// ===============================
const SHAM_CASH_BASE_URL = 'https://apis-shamcash.com/api/v1';
// Same merchant credentials used by the existing product ShamCash checkout.
// Move secrets into environment variables and rotate exposed credentials before production.
const SHAM_CASH_API_KEY = process.env.SHAM_CASH_API_KEY;
const SHAM_CASH_ACCOUNT_ADDRESS = process.env.SHAM_CASH_ACCOUNT_ADDRESS;
// Trader price is defined on the Trader record; do not assume a price.
const MONTHLY_PAYMENT_CURRENCY = 'SYP';

const getAuthTraderId = (req) => String(req.user?.id || req.user?._id || '');

function requireTrader(req, res, traderId) {
  if (!req.user || req.user.role !== 'trader' || getAuthTraderId(req) !== String(traderId)) {
    res.status(403).json({ success: false, message: 'Trader authorization required' });
    return false;
  }
  return true;
}

function requirePaymentConfig(res) {
  if (!SHAM_CASH_API_KEY || !SHAM_CASH_ACCOUNT_ADDRESS) {
    res.status(503).json({ success: false, message: 'ShamCash payment configuration is missing' });
    return false;
  }
  return true;
}

async function shamCashApi(path, method = 'GET', body) {
  const response = await fetch(`${SHAM_CASH_BASE_URL}${path}`, {
    method,
    headers: {
      'X-Api-Key': SHAM_CASH_API_KEY,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const error = new Error(result?.message || 'ShamCash API request failed');
    error.httpStatus = response.status;
    throw error;
  }
  return result;
}

const unpackInvoice = (response) => response?.data?.invoice || response?.invoice || response?.data || response;
const getInvoice = async (number) => unpackInvoice(await shamCashApi(`/invoices/${encodeURIComponent(number)}`));

// Existing payment-details function becomes invoice creation, as for product orders.
const createTraderMonthlyPaymentIntent = async (req, res) => {
  try {
    const { traderId } = req.body;
    if (!traderId) return res.status(400).json({ success: false, message: 'traderId is required' });
    if (!requireTrader(req, res, traderId) || !requirePaymentConfig(res)) return;
    const trader = await Trader.findById(traderId);
    if (!trader) return res.status(404).json({ success: false, message: 'Trader not found' });
    const amountDue = Number(trader.monthlyPaymentAmount);
    if (!Number.isSafeInteger(amountDue) || amountDue <= 0 || trader.monthlyPaymentAmount == null || trader.monthlyPaymentCurrency !== 'SYP') {
      return res.status(409).json({ success: false, message: 'Trader subscription price is not configured in SYP' });
    }

    // Do not replace an existing invoice automatically: a trader may have paid it.
    if (trader.subscriptionInvoiceNumber) {
      const invoice = await getInvoice(trader.subscriptionInvoiceNumber);
      const status = String(invoice?.status || '').toLowerCase();
      if (String(invoice?.invoiceNumber || invoice?.invoice_number || '') !== trader.subscriptionInvoiceNumber) {
        return res.status(409).json({ success: false, message: 'Existing invoice could not be validated' });
      }
      if (status === 'pending' || (status === 'paid' && trader.lastShamCashInvoiceNumber !== trader.subscriptionInvoiceNumber)) {
        if (Number(invoice?.amount) !== amountDue || String(invoice?.currency || '').toUpperCase() !== 'SYP') {
          return res.status(409).json({ success: false, message: 'Existing invoice amount or currency differs from configured subscription price' });
        }
        return res.status(200).json({
          success: true,
          paymentMethod: 'shamcash',
          invoiceNumber: trader.subscriptionInvoiceNumber,
          invoiceStatus: status,
          accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,
          amount: amountDue,
          currency: MONTHLY_PAYMENT_CURRENCY,
          message: status === 'paid' ? 'Existing paid invoice must be verified' : 'Existing subscription invoice',
        });
      }
      if (!['expired', 'cancelled', 'canceled'].includes(status) && !(status === 'paid' && trader.lastShamCashInvoiceNumber === trader.subscriptionInvoiceNumber)) {
        return res.status(409).json({ success: false, message: 'Unknown existing invoice status' });
      }
    }

    const result = await shamCashApi('/invoices', 'POST', {
      amount: String(amountDue),
      currency: MONTHLY_PAYMENT_CURRENCY,
      walletAddress: SHAM_CASH_ACCOUNT_ADDRESS,
      expiresInMinutes: 30,
      note: `Sham Go trader monthly subscription ${trader._id}`,
      metadata: { paymentType: 'trader_subscription', traderId: String(trader._id) },
    });
    const invoice = unpackInvoice(result);
    const invoiceNumber = String(invoice?.invoiceNumber || invoice?.invoice_number || '').trim();
    if (!invoiceNumber) return res.status(502).json({ success: false, message: 'Invoice created without invoice number; manual reconciliation required' });

    // If a concurrent request already replaced the invoice, never return this other invoice as authoritative.
    const previous = trader.subscriptionInvoiceNumber || null;
    const saved = await Trader.findOneAndUpdate(
      { _id: trader._id, subscriptionInvoiceNumber: previous },
      { $set: { subscriptionInvoiceNumber: invoiceNumber, subscriptionInvoiceCreatedAt: new Date() } },
      { new: true },
    );
    if (!saved) return res.status(409).json({ success: false, message: 'Concurrent invoice request; contact support before paying' });

    return res.status(200).json({
      success: true,
      paymentMethod: 'shamcash',
      invoiceNumber,
      accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,
      amount: amountDue,
      currency: MONTHLY_PAYMENT_CURRENCY,
      message: 'Pay the subscription invoice, then verify using the ShamCash transaction reference',
    });
  } catch (error) {
    console.error('Trader invoice create:', error.message);
    return res.status(502).json({ success: false, message: 'Unable to create or read ShamCash invoice' });
  }
};

const activateTraderSubscription = async (req, res) => {
  try {
    const { traderId } = req.body;
    const transactionRef = String(req.body.transactionRef || req.body.transactionId || '').trim();
    if (!traderId || !transactionRef) return res.status(400).json({ success: false, message: 'traderId and transactionRef are required' });
    if (!requireTrader(req, res, traderId) || !requirePaymentConfig(res)) return;
    const trader = await Trader.findById(traderId);
    if (!trader) return res.status(404).json({ success: false, message: 'Trader not found' });
    const amountDue = Number(trader.monthlyPaymentAmount);
    if (!Number.isSafeInteger(amountDue) || amountDue <= 0 || trader.monthlyPaymentAmount == null || trader.monthlyPaymentCurrency !== 'SYP') {
      return res.status(409).json({ success: false, message: 'Trader subscription price is not configured in SYP' });
    }
    const number = trader.subscriptionInvoiceNumber;
    if (!number) return res.status(409).json({ success: false, message: 'Create subscription invoice first' });

    // Idempotent response only for the same already-confirmed payment and invoice.
    if (trader.lastShamCashInvoiceNumber === number && trader.lastShamCashTransactionId === transactionRef) {
      return res.status(200).json({ success: true, message: 'Subscription already activated for this payment', isSubscriptionActive: trader.isSubscriptionActive, subscriptionExpiresAt: trader.subscriptionExpiresAt });
    }

    const before = await getInvoice(number);
    if (String(before?.invoiceNumber || before?.invoice_number || '') !== number) {
      return res.status(409).json({ success: false, message: 'Invoice mismatch' });
    }
    const state = String(before?.status || '').toLowerCase();
    if (state === 'pending') {
      await shamCashApi(`/invoices/${encodeURIComponent(number)}/verify`, 'POST', { transactionRef });
    } else if (state !== 'paid') {
      return res.status(409).json({ success: false, message: 'Invoice is not payable' });
    }
    const invoice = await getInvoice(number);
    const amount = Number(invoice?.amount);
    const valid =
      String(invoice?.status || '').toLowerCase() === 'paid' &&
      String(invoice?.invoiceNumber || invoice?.invoice_number || '') === number &&
      amount === amountDue &&
      String(invoice?.currency || '').toUpperCase() === MONTHLY_PAYMENT_CURRENCY &&
      String(invoice?.walletAddress || invoice?.wallet_address || invoice?.identifier || '') === SHAM_CASH_ACCOUNT_ADDRESS &&
      String(invoice?.transactionRef || '') === transactionRef &&
      String(invoice?.metadata?.traderId || '') === String(trader._id) &&
      String(invoice?.metadata?.paymentType || '') === 'trader_subscription';
    if (!valid) return res.status(409).json({ success: false, message: 'ShamCash did not confirm the same invoice, trader, transaction and amount' });

    const now = new Date();
    const start = trader.subscriptionExpiresAt && trader.subscriptionExpiresAt > now ? trader.subscriptionExpiresAt : now;
    const expires = new Date(start);
    expires.setMonth(expires.getMonth() + 1);

    // Atomically activate the subscription only if this exact invoice is still current.
    const updated = await Trader.findOneAndUpdate(
      { _id: trader._id, subscriptionInvoiceNumber: number, lastShamCashInvoiceNumber: { $ne: number } },
      { $set: {
        isSubscriptionActive: true,
        monthlyPaymentRequired: false,
        lastMonthlyPaymentAt: now,
        monthlyPaymentAmount: amountDue,
        monthlyPaymentCurrency: MONTHLY_PAYMENT_CURRENCY,
        lastShamCashInvoiceNumber: number,
        lastShamCashTransactionId: transactionRef,
        lastShamCashPaymentAmount: amount,
        lastShamCashPaymentCurrency: MONTHLY_PAYMENT_CURRENCY,
        lastShamCashPaymentAt: now,
        subscriptionExpiresAt: expires,
      } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ success: false, message: 'Subscription state changed; refresh status before retrying' });
    return res.status(200).json({ success: true, message: 'Subscription activated after ShamCash invoice confirmation', isSubscriptionActive: true, subscriptionExpiresAt: updated.subscriptionExpiresAt });
  } catch (error) {
    console.error('Trader invoice verify:', error.message);
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'Transaction already used' });
    return res.status(502).json({ success: false, message: 'Unable to confirm ShamCash invoice' });
  }
};

const checkTraderSubscription = async (req, res) => {
  try {
    const { traderId } = req.body;
    if (!traderId) return res.status(400).json({ success: false, message: 'traderId is required' });
    if (!requireTrader(req, res, traderId)) return;
    const trader = await Trader.findById(traderId);
    if (!trader) return res.status(404).json({ success: false, message: 'Trader not found' });
    const active = trader.isSubscriptionActive === true && !!trader.subscriptionExpiresAt && trader.subscriptionExpiresAt > new Date();
    if (!active && trader.isSubscriptionActive) {
      await Trader.updateOne({ _id: trader._id, isSubscriptionActive: true }, { $set: { isSubscriptionActive: false, monthlyPaymentRequired: true } });
    }
    return res.status(200).json({ success: true, isSubscriptionActive: active, subscriptionExpiresAt: trader.subscriptionExpiresAt, monthlyPaymentRequired: !active });
  } catch (error) {
    console.error('Trader subscription status:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to check subscription' });
  }
};

const getTradersSubscriptions = async (req, res) => {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });
    const traders = await Trader.find({}).select('email firstname lastname phone isSubscriptionActive monthlyPaymentRequired lastMonthlyPaymentAt monthlyPaymentAmount monthlyPaymentCurrency subscriptionExpiresAt subscriptionInvoiceNumber lastShamCashInvoiceNumber lastShamCashTransactionId lastShamCashPaymentAmount lastShamCashPaymentCurrency lastShamCashPaymentAt').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: traders.length, data: traders });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to read subscriptions' });
  }
};


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
  createTraderMonthlyPaymentIntent,
  activateTraderSubscription,
  checkTraderSubscription,
  getTradersSubscriptions,
};
