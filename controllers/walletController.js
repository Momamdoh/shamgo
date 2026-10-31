const asyncHandler = require("express-async-handler");
const { Wallet } = require("../models/Wallet");
const { WalletTransaction } = require("../models/WalletTransaction");

// Read-only endpoints. Credit and debit are handled separately in a
// MongoDB transaction when order cancellation/payment is implemented.
// These handlers require authentication middleware that sets req.user.
const getAuthenticatedUserId = (req) => req.user?._id || req.user?.id;

const getWalletBalance = asyncHandler(async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({
      status: "fail",
      message: "يجب تسجيل الدخول لعرض المحفظة",
    });
  }

  const wallet = await Wallet.findOne({ user: userId }).lean();

  return res.status(200).json({
    status: "success",
    data: {
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? "SYP",
    },
  });
});

const getWalletTransactions = asyncHandler(async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({
      status: "fail",
      message: "يجب تسجيل الدخول لعرض العمليات",
    });
  }

  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  if (
    !Number.isSafeInteger(rawPage) || rawPage < 1 ||
    !Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100
  ) {
    return res.status(400).json({
      status: "fail",
      message: "قيم الصفحة أو عدد النتائج غير صحيحة",
    });
  }

  const skip = (rawPage - 1) * rawLimit;
  if (!Number.isSafeInteger(skip)) {
    return res.status(400).json({
      status: "fail",
      message: "رقم الصفحة كبير جدًا",
    });
  }

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: userId })
      .select("order type reason amount currency balanceBefore balanceAfter createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(rawLimit)
      .lean(),
    WalletTransaction.countDocuments({ user: userId }),
  ]);

  return res.status(200).json({
    status: "success",
    data: transactions,
    pagination: {
      page: rawPage,
      limit: rawLimit,
      total,
      totalPages: Math.ceil(total / rawLimit),
    },
  });
});

module.exports = {
  getWalletBalance,
  getWalletTransactions,
};
