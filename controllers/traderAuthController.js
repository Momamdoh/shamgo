const asyncHandler = require("express-async-handler");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const admin = require("../config/firebase");
const { User } = require("../models/User");
const {
  Trader,
  validateInputTrader,
  validateLoginTrader,
} = require("../models/Trader");

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000);

const createMailTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });
};

const traderSignup = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    phone,
    institutionName,
    nationalId,
    email,
    password,
  } = req.body;

  const { error } = validateInputTrader(req.body);

  if (error) {
    const message = {};
    error.details.forEach((item) => {
      message[item.path[0]] = item.message;
    });

    return res.status(200).json({
      status: "fail",
      message,
    });
  }

  const errors = {};

  const traderByEmail = await Trader.findOne({ email });
  if (traderByEmail) errors.email = "البريد الإلكتروني مستخدم بالفعل";

  const traderByPhone = await Trader.findOne({ phone });
  if (traderByPhone) errors.phone = "رقم الهاتف مستخدم بالفعل";

  const traderByNationalId = await Trader.findOne({ nationalId });
  if (traderByNationalId) errors.nationalId = "الرقم القومي مستخدم بالفعل";

  if (Object.keys(errors).length > 0) {
    return res.status(200).json({
      status: "fail",
      message: errors,
    });
  }

  const verificationCode = generateVerificationCode();

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const trader = new Trader({
    name,
    address,
    phone,
    institutionName,
    nationalId,
    email,
    password: hashedPassword,
    verificationCode,
    isVerified: false,
    adminApprovalStatus: "pending",
    adminRejectedReason: null,
    adminReviewedAt: null,
    image: req.savedImage ? req.savedImage.imagePath : "d.png",
  });

  await trader.save();

  const transporter = createMailTransporter();

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: "كود التحقق من حساب التاجر",
    text: `كود التحقق الخاص بك هو: ${verificationCode}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(200).json({
        status: "fail",
        message: { email: "فشل في إرسال كود التحقق" },
      });
    }

    const token = trader.generateToken();

    const traderData = {
      _id: trader._id,
      name: trader.name,
      address: trader.address,
      phone: trader.phone,
      institutionName: trader.institutionName,
      nationalId: trader.nationalId,
      email: trader.email,
      image: trader.image,
      adminApprovalStatus: trader.adminApprovalStatus,
    };

    return res.status(201).json({
      status: "success",
      message: "تم إرسال كود التحقق بنجاح والحساب تحت مراجعة الإدارة",
      traderId: trader._id,
      token,
      data: traderData,
    });
  });
});

const traderVerify = asyncHandler(async (req, res) => {
  const { email, verificationCode } = req.body;

  const trader = await Trader.findOne({ email });

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  if (trader.verificationCode !== Number(verificationCode)) {
    return res.status(200).json({
      status: "fail",
      message: "كود التحقق غير صحيح",
    });
  }

  trader.isVerified = true;
  trader.verificationCode = null;

  await trader.save();

  const admins = await User.find({
    isAdmin: true,
    fcmToken: { $nin: [null, ""] },
  });

  await Promise.all(
    admins
      .filter((adminUser) => adminUser.fcmToken?.toString().trim())
      .map((adminUser) =>
        admin
          .messaging()
          .send({
            notification: {
              title: "طلب تاجر جديد",
              body: `${trader.name} بانتظار المراجعة`,
            },
            data: {
              route: "/adminTraderReview",
              traderId: trader._id.toString(),
              type: "trader_review",
            },
            token: adminUser.fcmToken.toString(),
          })
          .catch((err) => {
            console.log("Admin trader notification failed:", err.message);
          }),
      ),
  );

  const token = trader.generateToken();

  return res.status(200).json({
    status: "success",
    message: "تم التحقق من الحساب بنجاح والحساب تحت مراجعة الإدارة",
    token,
    trader,
  });
});

const traderLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { error } = validateLoginTrader(req.body);

  if (error) {
    const message = {};
    error.details.forEach((item) => {
      message[item.path[0]] = item.message;
    });

    return res.status(200).json({
      status: "fail",
      message,
    });
  }

  const trader = await Trader.findOne({ email });

  if (!trader) {
    return res.status(200).json({
      status: "fail",
      message: { email: "الحساب غير موجود" },
    });
  }

  const isPasswordMatch = await bcrypt.compare(password, trader.password);

  if (!isPasswordMatch) {
    return res.status(200).json({
      status: "fail",
      message: { password: "كلمة المرور غير صحيحة" },
    });
  }

  if (!trader.isVerified) {
    return res.status(200).json({
      status: "fail",
      message: { email: "الحساب غير مفعل بعد" },
    });
  }

  if (trader.adminApprovalStatus === "pending") {
    return res.status(200).json({
      status: "fail",
      message: { email: "حسابك تحت المراجعة من الإدارة" },
    });
  }

  if (trader.adminApprovalStatus === "rejected") {
    return res.status(200).json({
      status: "fail",
      message: { email: "تم رفض حسابك من الإدارة" },
    });
  }

  trader.isOnline = true;
  await trader.save();

  const token = trader.generateToken();

  const traderData = {
    _id: trader._id,
    name: trader.name,
    address: trader.address,
    phone: trader.phone,
    institutionName: trader.institutionName,
    nationalId: trader.nationalId,
    email: trader.email,
    image: trader.image,
    adminApprovalStatus: trader.adminApprovalStatus,
  };

  return res.status(200).json({
    status: "success",
    data: traderData,
    token,
  });
});

const updateTraderFcmToken = asyncHandler(async (req, res) => {
  const { _id, fcmToken } = req.body;

  if (!_id) {
    return res.status(400).json({
      status: "fail",
      message: "معرف التاجر مطلوب",
    });
  }

  const trader = await Trader.findById(_id);

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  trader.fcmToken = fcmToken;
  trader.isOnline = !!fcmToken;

  await trader.save();

  return res.status(200).json({
    status: "success",
    message: "تم تحديث FCM Token بنجاح",
    traderId: trader._id,
    fcmToken: trader.fcmToken,
  });
});

const getPendingTradersForAdmin = asyncHandler(async (req, res) => {
  const traders = await Trader.find({
    adminApprovalStatus: "pending",
    isVerified: true,
  })
    .select(
      "_id name address phone institutionName nationalId email image adminApprovalStatus createdAt"
    )
    .sort({ createdAt: -1 });

  return res.status(200).json({
    status: "success",
    traders,
  });
});

const approveTraderByAdmin = asyncHandler(async (req, res) => {
  const { traderId } = req.body;

  const trader = await Trader.findById(traderId);

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  trader.adminApprovalStatus = "approved";
  trader.adminRejectedReason = null;
  trader.adminReviewedAt = new Date();

  await trader.save();

  const transporter = createMailTransporter();

  await transporter.sendMail({
    from: `"Shamgo" <${process.env.USER_EMAIL}>`,
    to: trader.email,
    subject: "تمت الموافقة على حساب التاجر",
    text: "تمت الموافقة على حسابك كتاجر في Shamgo. يمكنك الآن تسجيل الدخول.",
  });

  return res.status(200).json({
    status: "success",
    message: "تمت الموافقة على التاجر",
  });
});

const rejectTraderByAdmin = asyncHandler(async (req, res) => {
  const { traderId, reason } = req.body;

  const trader = await Trader.findById(traderId);

  if (!trader) {
    return res.status(404).json({
      status: "fail",
      message: "التاجر غير موجود",
    });
  }

  const rejectedReason = reason || "لم يتم قبول بيانات الحساب";

  const transporter = createMailTransporter();

  await transporter.sendMail({
    from: `"Shamgo" <${process.env.USER_EMAIL}>`,
    to: trader.email,
    subject: "تم رفض حساب التاجر",
    text: `تم رفض حسابك كتاجر في Shamgo. السبب: ${rejectedReason}`,
  });

  await Trader.findByIdAndDelete(traderId);

  return res.status(200).json({
    status: "success",
    message: "تم رفض التاجر وحذف الحساب",
  });
});

const sendTraderResetCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(200).json({
      status: "fail",
      message: {
        email: "البريد الإلكتروني مطلوب",
      },
    });
  }

  const trader = await Trader.findOne({ email });

  if (!trader) {
    return res.status(200).json({
      status: "fail",
      message: {
        email: "الحساب غير موجود",
      },
    });
  }

  const resetCode = generateVerificationCode();

  trader.resetPasswordCode = resetCode;
  trader.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await trader.save();

  const transporter = createMailTransporter();

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: "كود إعادة تعيين كلمة مرور التاجر",
    text: `كود إعادة تعيين كلمة المرور هو: ${resetCode}`,
  };

  await transporter.sendMail(mailOptions);

  return res.status(200).json({
    status: "success",
    message: "تم إرسال كود إعادة التعيين إلى البريد الإلكتروني",
  });
});

const verifyTraderResetCode = asyncHandler(async (req, res) => {
  const { email, resetCode } = req.body;

  const trader = await Trader.findOne({ email });

  if (!trader) {
    return res.status(200).json({
      status: "fail",
      message: "الحساب غير موجود",
    });
  }

  if (
    trader.resetPasswordCode !== Number(resetCode) ||
    !trader.resetPasswordExpire ||
    trader.resetPasswordExpire < Date.now()
  ) {
    return res.status(200).json({
      status: "fail",
      message: "كود التحقق غير صحيح أو منتهي الصلاحية",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "تم التحقق من الكود بنجاح",
  });
});

const resetTraderPassword = asyncHandler(async (req, res) => {
  const { email, resetCode, password, confirmPassword } = req.body;

  const trader = await Trader.findOne({ email });

  if (!trader) {
    return res.status(200).json({
      status: "fail",
      message: "الحساب غير موجود",
    });
  }

  if (
    trader.resetPasswordCode !== Number(resetCode) ||
    !trader.resetPasswordExpire ||
    trader.resetPasswordExpire < Date.now()
  ) {
    return res.status(200).json({
      status: "fail",
      message: "كود التحقق غير صحيح أو منتهي الصلاحية",
    });
  }

  if (!password || password.length < 6) {
    return res.status(200).json({
      status: "fail",
      message: "كلمة المرور يجب ألا تقل عن 6 أحرف",
    });
  }

  if (password !== confirmPassword) {
    return res.status(200).json({
      status: "fail",
      message: "تأكيد كلمة المرور غير متطابق",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  trader.password = hashedPassword;
  trader.resetPasswordCode = null;
  trader.resetPasswordExpire = null;

  await trader.save();

  return res.status(200).json({
    status: "success",
    message: "تم تغيير كلمة المرور بنجاح",
  });
});

module.exports = {
  traderSignup,
  traderVerify,
  traderLogin,
  updateTraderFcmToken,
  getPendingTradersForAdmin,
  approveTraderByAdmin,
  rejectTraderByAdmin,
  sendTraderResetCode,
  verifyTraderResetCode,
  resetTraderPassword,
};