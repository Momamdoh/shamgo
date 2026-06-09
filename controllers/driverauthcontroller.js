const asyncHandler = require("express-async-handler");
const { Driver } = require("../models/Driver");
const { User } = require("../models/User");
const admin = require("../config/firebase");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000);

const driverSignup = asyncHandler(async (req, res) => {
  const {
    firstname,
    lastname,
    carType,
    carNumber,
    email,
    password,
    latitude,
    longitude,
    phone,
    vehicleCategory,
    licenseNumber,
    nationalId,
  } = req.body;

  const errors = {};
  const phoneValue = phone ? phone.toString().trim() : "";

  if (!firstname || firstname.length < 3)
    errors.firstname = "الاسم الأول مطلوب وطوله لا يقل عن 3";

  if (!lastname || lastname.length < 3)
    errors.lastname = "الاسم الأخير مطلوب وطوله لا يقل عن 3";

  if (!carType) errors.carType = "نوع العربية مطلوب";
  if (!carNumber) errors.carNumber = "رقم العربية مطلوب";
  if (!email) errors.email = "البريد الإلكتروني مطلوب";

  if (!password || password.length < 6)
    errors.password = "الرقم السري يجب ألا يقل عن 6";

  if (!phoneValue) errors.phone = "رقم الهاتف مطلوب";
  if (!licenseNumber) errors.licenseNumber = "رقم الرخصة مطلوب";
  if (!nationalId) errors.nationalId = "رقم البطاقة مطلوب";

  if (!req.savedLicenseImage)
    errors.licenseImage = "صورة الرخصة مطلوبة";

  const existsCar = await Driver.findOne({ carNumber });
  if (existsCar) errors.carNumber = "رقم العربية مستخدم بالفعل";

  const existsEmail = await Driver.findOne({ email });
  if (existsEmail) errors.email = "البريد الإلكتروني مستخدم بالفعل";

  const existsPhone = await Driver.findOne({ phone: phoneValue });
  if (existsPhone) errors.phone = "رقم الهاتف مستخدم بالفعل";

  const existsLicense = await Driver.findOne({ licenseNumber });
  if (existsLicense) errors.licenseNumber = "رقم الرخصة مستخدم بالفعل";

  const existsNationalId = await Driver.findOne({ nationalId });
  if (existsNationalId) errors.nationalId = "رقم البطاقة مستخدم بالفعل";

  if (Object.keys(errors).length > 0)
    return res.status(200).json({ status: "fail", message: errors });

  const verificationCode = generateVerificationCode();
  const hashedPassword = await bcrypt.hash(password, 10);

  const driver = new Driver({
    firstname,
    lastname,
    carType,
    carNumber,
    email,
    password: hashedPassword,
    verificationCode,
    phone: phoneValue,
    licenseNumber,
    nationalId,
    vehicleCategory: vehicleCategory || "car",
    image: req.savedImage ? req.savedImage.imagePath : "d.png",
    licenseImage: req.savedLicenseImage.imagePath,
    adminApprovalStatus: "pending",
    adminRejectedReason: null,
    location: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
  });

  await driver.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: "كود التحقق من الحساب كسائق",
    text: `كود التحقق الخاص بك هو: ${verificationCode}`,
  };

  transporter.sendMail(mailOptions, async (error, info) => {
    if (error) {
      return res.status(500).json({
        status: "fail",
        message: { email: "فشل في إرسال كود التحقق" },
      });
    }

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
            title: "طلب سائق جديد",
            body: `${driver.firstname} ${driver.lastname} بانتظار المراجعة`,
          },
          data: {
            route: "/adminDriverReview",
            driverId: driver._id.toString(),
            type: "driver_review",
          },
          token: adminUser.fcmToken.toString(),
        })
        .catch((err) => {
          console.log("Admin notification failed:", err.message);
        }),
    ),
);

    const token = driver.generateToken();

    const driverData = {
      _id: driver._id,
      fname: driver.firstname,
      lname: driver.lastname,
      email: driver.email,
      phone: driver.phone,
      carNumber: driver.carNumber,
      licenseNumber: driver.licenseNumber,
      nationalId: driver.nationalId,
      vehicleCategory: driver.vehicleCategory,
      image: driver.image || null,
      licenseImage: driver.licenseImage || null,
      adminApprovalStatus: driver.adminApprovalStatus,
    };

    return res.status(201).json({
      status: "success",
      message: "تم إرسال كود التحقق بنجاح والحساب تحت المراجعة",
      driverId: driver._id,
      token,
      data: driverData,
    });
  });
});

const driverVerify = asyncHandler(async (req, res) => {
  const { email, verificationCode } = req.body;

  const driver = await Driver.findOne({ email });

  if (!driver)
    return res.status(404).json({
      status: "fail",
      message: "السائق غير موجود",
    });

  if (driver.verificationCode !== Number(verificationCode)) {
    return res.status(200).json({
      status: "fail",
      message: "كود التحقق غير صحيح",
    });
  }

  driver.isVerified = true;
  driver.verificationCode = null;

  await driver.save();

  const token = driver.generateToken();

  res.status(200).json({
    status: "success",
    message: "تم التحقق من الحساب بنجاح",
    token,
    driver,
  });
});

const driverLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const message = {};
  let foundDriver = null;

  if (!email) message.email = "البريد الإلكتروني مطلوب";

  if (!password) message.password = "الرقم السري مطلوب";

  if (Object.keys(message).length > 0) {
    return res.status(200).json({
      status: "fail",
      message,
    });
  }

  foundDriver = await Driver.findOne({ email });

  if (!foundDriver) {
    return res.status(200).json({
      status: "fail",
      message: { email: "الحساب غير موجود" },
    });
  }

  const isPasswordMatch = await bcrypt.compare(password, foundDriver.password);

  if (!isPasswordMatch) {
    return res.status(200).json({
      status: "fail",
      message: { password: "الرقم السري غير صحيح" },
    });
  }

  if (!foundDriver.isVerified) {
    return res.status(200).json({
      status: "fail",
      message: { email: "الحساب غير مفعل بعد" },
    });
  }

  if (foundDriver.adminApprovalStatus === "pending") {
  return res.status(200).json({
    status: "fail",
    message: { email: "حسابك تحت المراجعة من الإدارة" },
  });
}

if (foundDriver.adminApprovalStatus === "rejected") {
  return res.status(200).json({
    status: "fail",
    message: { email: "تم رفض حسابك من الإدارة" },
  });
}

  foundDriver.isOnline = true;
  await foundDriver.save();

  const token = foundDriver.generateToken();

  const now = new Date();

const isSubscriptionActive =
  foundDriver.isSubscriptionActive === true &&
  foundDriver.subscriptionExpiresAt &&
  new Date(foundDriver.subscriptionExpiresAt) > now;

if (!isSubscriptionActive && foundDriver.isSubscriptionActive === true) {
  foundDriver.isSubscriptionActive = false;
  foundDriver.monthlyPaymentRequired = true;
  await foundDriver.save();
}

const driverData = {
  _id: foundDriver._id,
  fname: foundDriver.firstname,
  lname: foundDriver.lastname,
  email: foundDriver.email,
  phone: foundDriver.phone,
  carNumber: foundDriver.carNumber,
  licenseNumber: foundDriver.licenseNumber,
  nationalId: foundDriver.nationalId,
  vehicleCategory: foundDriver.vehicleCategory,
  image: foundDriver.image,
  licenseImage: foundDriver.licenseImage || null,
  completedTripsCount: foundDriver.completedTripsCount || 0,

  isSubscriptionActive,
  subscriptionExpiresAt: foundDriver.subscriptionExpiresAt,
  monthlyPaymentRequired: !isSubscriptionActive,
};

  return res.status(200).json({
    status: "success",
    data: driverData,
    token,
  });
});

const updateFcmToken = asyncHandler(async (req, res) => {
  const { _id, fcmToken } = req.body;

  if (!_id) {
    return res.status(400).json({
      status: "fail",
      message: "يجب إرسال المعرف",
    });
  }

  const driver = await Driver.findById(_id);

  if (!driver) {
    return res.status(404).json({
      status: "fail",
      message: "السائق غير موجود",
    });
  }

  driver.fcmToken = fcmToken;
  driver.isOnline = !!fcmToken;

  await driver.save();

  return res.status(200).json({
    status: "success",
    message: "تم تحديث FCM Token بنجاح",
    driverId: driver._id,
    fcmToken: driver.fcmToken,
  });
});

const sendDriverResetCode = asyncHandler(async (req, res) => {
  console.log("Driver reset password request received");
  console.log("Request body:", req.body);

  const { email } = req.body;

  if (!email) {
    return res.status(200).json({
      status: "fail",
      message: { email: "البريد الإلكتروني مطلوب" },
    });
  }

  const driver = await Driver.findOne({ email });

  console.log("Driver found:", !!driver);

  if (!driver) {
    return res.status(200).json({
      status: "fail",
      message: { email: "الحساب غير موجود" },
    });
  }

  const resetCode = generateVerificationCode();

  console.log("Generated reset code:", resetCode);

  driver.resetPasswordCode = resetCode;
  driver.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

  await driver.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  console.log("Sending reset password email to:", email);

  const mailOptions = {
    from: `"Shamgo" <${process.env.USER_EMAIL}>`,
    to: email,
    subject: "Shamgo Driver Reset Password Code",
    text: `Your driver reset password code is ${resetCode}.`,
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Shamgo Driver Password Reset</h2>
        <p>Your reset password code is:</p>
        <h1 style="letter-spacing: 4px;">${resetCode}</h1>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Reset email sending failed:", error.message);

      return res.status(200).json({
        status: "fail",
        message: { email: "فشل إرسال كود إعادة التعيين" },
      });
    }

    console.log("Reset email sent successfully:", info.response);
    console.log("Reset email sent to:", email);

    return res.status(200).json({
      status: "success",
      message: "تم إرسال كود إعادة التعيين على البريد الإلكتروني",
      email: email,
    });
  });
});

const verifyDriverResetCode = asyncHandler(async (req, res) => {
  const { email, resetCode } = req.body;

  if (!email || !resetCode) {
    return res.status(200).json({
      status: "fail",
      message: "البريد الإلكتروني والكود مطلوبان",
    });
  }

  const driver = await Driver.findOne({ email });

  if (!driver) {
    return res.status(200).json({
      status: "fail",
      message: "الحساب غير موجود",
    });
  }

  if (
    driver.resetPasswordCode !== Number(resetCode) ||
    !driver.resetPasswordExpire ||
    driver.resetPasswordExpire < Date.now()
  ) {
    return res.status(200).json({
      status: "fail",
      message: "الكود غير صحيح أو منتهي",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "الكود صحيح",
  });
});

const resetDriverPassword = asyncHandler(async (req, res) => {
  const { email, resetCode, password, confirmPassword } = req.body;

  if (!email || !resetCode || !password || !confirmPassword) {
    return res.status(200).json({
      status: "fail",
      message: "كل البيانات مطلوبة",
    });
  }

  if (password.length < 6) {
    return res.status(200).json({
      status: "fail",
      message: { password: "الرقم السري يجب ألا يقل عن 6" },
    });
  }

  if (password !== confirmPassword) {
    return res.status(200).json({
      status: "fail",
      message: { confirmPassword: "كلمة المرور غير متطابقة" },
    });
  }

  const driver = await Driver.findOne({ email });

  if (!driver) {
    return res.status(200).json({
      status: "fail",
      message: "الحساب غير موجود",
    });
  }

  if (
    driver.resetPasswordCode !== Number(resetCode) ||
    !driver.resetPasswordExpire ||
    driver.resetPasswordExpire < Date.now()
  ) {
    return res.status(200).json({
      status: "fail",
      message: "الكود غير صحيح أو منتهي",
    });
  }

  driver.password = await bcrypt.hash(password, 10);
  driver.resetPasswordCode = null;
  driver.resetPasswordExpire = null;

  await driver.save();

  return res.status(200).json({
    status: "success",
    message: "تم تغيير كلمة المرور بنجاح",
  });
});


const approveDriverByAdmin = asyncHandler(async (req, res) => {
  const { driverId } = req.body;

  const driver = await Driver.findById(driverId);

  if (!driver) {
    return res.status(404).json({
      status: "fail",
      message: "السائق غير موجود",
    });
  }

  driver.adminApprovalStatus = "approved";
  driver.adminRejectedReason = null;
  driver.adminReviewedAt = new Date();

  await driver.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Shamgo" <${process.env.USER_EMAIL}>`,
    to: driver.email,
    subject: "تمت الموافقة على حساب السائق",
    text: "تمت الموافقة على حسابك كسائق في Shamgo. يمكنك الآن تسجيل الدخول.",
  });

  return res.status(200).json({
    status: "success",
    message: "تمت الموافقة على السائق",
  });
});

const rejectDriverByAdmin = asyncHandler(async (req, res) => {
  const { driverId, reason } = req.body;

  const driver = await Driver.findById(driverId);

  if (!driver) {
    return res.status(404).json({
      status: "fail",
      message: "السائق غير موجود",
    });
  }

  const rejectReason = reason || "لم يتم قبول بيانات الحساب";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Shamgo" <${process.env.USER_EMAIL}>`,
    to: driver.email,
    subject: "تم رفض حساب السائق",
    text: `تم رفض حسابك كسائق في Shamgo. السبب: ${rejectReason}`,
  });

  await Driver.findByIdAndDelete(driverId);

  return res.status(200).json({
    status: "success",
    message: "تم رفض السائق وحذف الحساب",
  });
});



const getPendingDriversForAdmin = asyncHandler(async (req, res) => {
  const drivers = await Driver.find({
    adminApprovalStatus: "pending",
    isVerified: true,
  })
    .select(
      "_id firstname lastname email phone image licenseImage licenseNumber nationalId carType carNumber vehicleCategory adminApprovalStatus createdAt"
    )
    .sort({ createdAt: -1 });

  return res.status(200).json({
    status: "success",
    drivers,
  });
});

module.exports = {
  driverSignup,
  driverVerify,
  driverLogin,
  updateFcmToken,
  sendDriverResetCode,
  verifyDriverResetCode,
  resetDriverPassword,
  approveDriverByAdmin,
rejectDriverByAdmin,
getPendingDriversForAdmin
};