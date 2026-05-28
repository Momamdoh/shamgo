const asyncHandler = require("express-async-handler");
const { Driver } = require("../models/Driver");
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
  } = req.body;

  const errors = {};

  if (!firstname || firstname.length < 3)
    errors.firstname = "الاسم الأول مطلوب وطوله لا يقل عن 3";

  if (!lastname || lastname.length < 3)
    errors.lastname = "الاسم الأخير مطلوب وطوله لا يقل عن 3";

  if (!carType) errors.carType = "نوع العربية مطلوب";

  if (!carNumber) errors.carNumber = "رقم العربية مطلوب";

  if (!email) errors.email = "البريد الإلكتروني مطلوب";

  if (!password || password.length < 6)
    errors.password = "الرقم السري يجب ألا يقل عن 6";

  if (!phone || phone.length !== 11)
    errors.phone = "رقم الهاتف يجب أن يكون 11 رقمًا";

  const exists = await Driver.findOne({ carNumber });
  if (exists) errors.carNumber = "رقم العربية مستخدم بالفعل";

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
    phone,
    vehicleCategory: vehicleCategory || "car",
    image: req.savedImage ? req.savedImage.imagePath : "d.png",
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

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).json({
        status: "fail",
        message: { email: "فشل في إرسال كود التحقق" },
      });
    }

    const token = driver.generateToken();

    const driverData = {
      _id: driver._id,
      fname: driver.firstname,
      lname: driver.lastname,
      email: driver.email,
      phone: driver.phone,
      carNumber: driver.carNumber,
      vehicleCategory: driver.vehicleCategory,
      image: driver.image || null,
    };

    return res.status(201).json({
      status: "success",
      message: "تم إرسال كود التحقق بنجاح",
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

  foundDriver.isOnline = true;
  await foundDriver.save();

  const token = foundDriver.generateToken();

  const driverData = {
    _id: foundDriver._id,
    fname: foundDriver.firstname,
    lname: foundDriver.lastname,
    email: foundDriver.email,
    phone: foundDriver.phone,
    carNumber: foundDriver.carNumber,
    vehicleCategory: foundDriver.vehicleCategory,
    image: foundDriver.image,
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

module.exports = {
  driverSignup,
  driverVerify,
  driverLogin,
  updateFcmToken,
};