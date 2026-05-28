const asyncHandler = require("express-async-handler");
const bcrypt = require("bcrypt");
const { Trader, validateInputTrader, validateLoginTrader } = require("../models/Trader");

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
  if (traderByEmail) {
    errors.email = "البريد الإلكتروني مستخدم بالفعل";
  }

  const traderByPhone = await Trader.findOne({ phone });
  if (traderByPhone) {
    errors.phone = "رقم الهاتف مستخدم بالفعل";
  }

  const traderByNationalId = await Trader.findOne({ nationalId });
  if (traderByNationalId) {
    errors.nationalId = "الرقم القومي مستخدم بالفعل";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(200).json({
      status: "fail",
      message: errors,
    });
  }

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
  });

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
  };

  return res.status(201).json({
    status: "success",
    message: "تم تسجيل التاجر بنجاح",
    token,
    data: traderData,
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

module.exports = {
  traderSignup,
  traderLogin,
  updateTraderFcmToken,
};