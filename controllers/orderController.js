const asyncHandler = require("express-async-handler");
const { Order, validateCreateOrder } = require("../models/Order");
const { User } = require("../models/User");
const { TraderAd } = require("../models/TraderAd");

const createOrder = asyncHandler(async (req, res) => {
  const { userId, items, address, phone } = req.body;

  const { error } = validateCreateOrder({
    userId,
    items,
    address,
    phone,
  });

  if (error) {
    return res.status(200).json({
      status: "fail",
      message: error.details[0].message,
    });
  }

  const user = await User.findById(userId).select("_id");

  if (!user) {
    return res.status(404).json({
      status: "fail",
      message: "المستخدم غير موجود",
    });
  }

  const orderItems = [];
  let totalPrice = 0;

  for (const item of items) {
    const ad = await TraderAd.findById(item.adId).populate("trader");

    if (!ad) continue;

    if (ad.adType !== "product") continue;

    const quantity = Number(item.quantity);
    const price = Number(ad.price);
    const total = price * quantity;

    orderItems.push({
      ad: ad._id,
      trader: ad.trader._id,
      title: ad.title,
      image: ad.image,
      price,
      quantity,
      total,
    });

    totalPrice += total;
  }

  if (!orderItems.length) {
    return res.status(200).json({
      status: "fail",
      message: "لا توجد منتجات صالحة في الطلب",
    });
  }

  const order = await Order.create({
    user: userId,
    address,
    phone,
    items: orderItems,
    totalPrice,
  });

  return res.status(201).json({
    status: "success",
    message: "تم إرسال الطلب للأدمن بنجاح",
    data: order,
  });
});

const getAdminOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate("user", "fname lname email image phone")
    .populate("items.ad", "title category image price")
    .populate("items.trader", "name phone email institutionName")
    .lean();

  return res.status(200).json({
    status: "success",
    count: orders.length,
    orders,
  });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!["pending", "accepted", "rejected", "completed"].includes(status)) {
    return res.status(200).json({
      status: "fail",
      message: "حالة الطلب غير صحيحة",
    });
  }

  const order = await Order.findByIdAndUpdate(
    orderId,
    { status },
    { new: true }
  );

  if (!order) {
    return res.status(404).json({
      status: "fail",
      message: "الطلب غير موجود",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "تم تحديث حالة الطلب",
    data: order,
  });
});


const getUserOrders = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate("items.ad", "title category image price")
    .populate("items.trader", "name phone email institutionName")
    .lean();

  return res.status(200).json({
    status: "success",
    count: orders.length,
    orders,
  });
});


const cancelUserOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { userId } = req.body;

  console.log("CANCEL ORDER PARAMS =>", req.params);
  console.log("CANCEL ORDER BODY =>", req.body);
  console.log("ORDER ID =>", orderId);
  console.log("USER ID =>", userId);

  if (!orderId || !userId) {
    return res.status(200).json({
      status: "fail",
      message: "orderId أو userId ناقص",
    });
  }

  const order = await Order.findById(orderId);

  console.log("FOUND ORDER =>", order);

  if (!order) {
    return res.status(404).json({
      status: "fail",
      message: "الطلب غير موجود",
    });
  }

  console.log("ORDER USER =>", order.user?.toString());
  console.log("REQUEST USER =>", userId?.toString());
  console.log("ORDER STATUS =>", order.status);

  if (order.user.toString() !== userId.toString()) {
    return res.status(403).json({
      status: "fail",
      message: "هذا الطلب لا يخص هذا المستخدم",
    });
  }

  if (order.status !== "pending") {
    return res.status(200).json({
      status: "fail",
      message: "لا يمكن إلغاء الطلب بعد مراجعته",
    });
  }

  order.status = "cancelled";
  await order.save();

  return res.status(200).json({
    status: "success",
    message: "تم إلغاء الطلب بنجاح",
    data: order,
  });
});

module.exports = {
  createOrder,
  getAdminOrders,
  updateOrderStatus,
  getUserOrders,
  cancelUserOrder,
};