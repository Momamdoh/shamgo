const asyncHandler = require("express-async-handler");

const {
  Order,

  validateCreateOrder,
} = require("../models/Order");

const { User } = require("../models/User");

const { Trader } = require("../models/Trader");

const { TraderAd } = require("../models/TraderAd");

// ===============================

// SHAM CASH - NEW INVOICE API

// ===============================

// Configure SHAM_CASH_API_KEY in the server environment; rotate previously exposed keys.

const SHAM_CASH_BASE_URL = "https://apis-shamcash.com/api/v1";

const SHAM_CASH_API_KEY = process.env.SHAM_CASH_API_KEY;

const SHAM_CASH_ACCOUNT_ADDRESS = "808a1f30127920b7ae0b6307c47b1164";

const SHAM_CASH_ACCOUNT_NUMBER = "5292637104988624";

const SHAM_CASH_ACCOUNT_NAME = "داود احمد الحاجي طعمة";

const ORDER_PAYMENT_CURRENCY = "SYP";

const shamCashApi = async (path, method = "GET", body) => {
  const response = await fetch(`${SHAM_CASH_BASE_URL}${path}`, {
    method,

    headers: {
      "X-Api-Key": SHAM_CASH_API_KEY,

      Accept: "application/json",

      ...(body ? { "Content-Type": "application/json" } : {}),
    },

    ...(body ? { body: JSON.stringify(body) } : {}),

    signal: AbortSignal.timeout(15000),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    const error = new Error(
      typeof result?.message === "string"
        ? result.message
        : "ShamCash API request failed",
    );
    error.statusCode = response.status;
    error.providerCode = typeof result?.code === "string" ? result.code : null;
    throw error;
  }

  return result;
};

const createOrderInvoice = async (order) => {
  const amount = Number(order.totalPrice);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d+(\.\d{1,2})?$/.test(String(amount))
  ) {
    throw new Error("Invalid order total for ShamCash");
  }

  const result = await shamCashApi("/invoices", "POST", {
    amount: String(amount), // API requires string, not number

    currency: ORDER_PAYMENT_CURRENCY,

    walletAddress: SHAM_CASH_ACCOUNT_ADDRESS,

    expiresInMinutes: 30,

    note: `Sham Go product order ${order._id}`,

    metadata: { paymentType: "product_order", orderId: String(order._id) },
  });

  // API response fields must be validated before persisting.

  const invoice =
    result.data?.invoice || result.invoice || result.data || result;

  const invoiceNumber = invoice?.invoiceNumber || invoice?.invoice_number;

  if (typeof invoiceNumber !== "string" || !invoiceNumber.trim()) {
    const error = new Error(
      "Invoice created but invoiceNumber response format is unknown; check ShamCash documentation",
    );

    error.statusCode = 502;

    throw error;
  }

  return { invoiceNumber: invoiceNumber.trim(), details: invoice };
};

const getInvoice = async (invoiceNumber) =>
  shamCashApi(`/invoices/${encodeURIComponent(invoiceNumber)}`);

// Never mark an order paid solely because POST /verify returns HTTP 200.

const verifyOrderShamCashPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const transactionRef =
    typeof req.body?.transactionRef === "string"
      ? req.body.transactionRef.trim()
      : "";

  if (!transactionRef) {
    return res

      .status(400)

      .json({ status: "fail", message: "أدخل رقم التحويل الصحيح" });
  }

  const order = await Order.findById(orderId);

  if (!order)
    return res.status(404).json({ status: "fail", message: "الطلب غير موجود" });

  if (order.paymentMethod !== "sham_cash_wallet") {
    return res

      .status(400)

      .json({ status: "fail", message: "الطلب ليس دفع ShamCash" });
  }

  // Idempotent response ONLY for the exact transaction previously stored for this order.

  if (order.paymentStatus === "paid") {
    if (order.shamCashTransactionId === transactionRef) {
      return res

        .status(200)

        .json({
          status: "success",

          message: "الطلب مدفوع بالفعل",

          data: order,
        });
    }

    return res

      .status(409)

      .json({ status: "fail", message: "الطلب مدفوع بعملية مختلفة" });
  }

  if (order.status !== "pending" || order.paymentStatus !== "pending") {
    return res

      .status(409)

      .json({ status: "fail", message: "لا يمكن تأكيد دفع طلب غير معلق" });
  }

  if (!order.shamCashInvoiceNumber) {
    return res

      .status(409)

      .json({ status: "fail", message: "لا توجد فاتورة محفوظة للطلب" });
  }

  const used = await Order.exists({ shamCashTransactionId: transactionRef });

  if (used) {
    return res

      .status(409)

      .json({ status: "fail", message: "رقم التحويل مستخدم في طلب آخر" });
  }

  const invoicePath = `/invoices/${encodeURIComponent(order.shamCashInvoiceNumber)}`;

  // Check the exact invoice before verifying a transaction.
  // A transfer to the wallet by itself does not prove this invoice was paid.
  let invoiceBefore;
  try {
    const readBefore = await getInvoice(order.shamCashInvoiceNumber);
    invoiceBefore =
      readBefore?.data?.invoice ||
      readBefore?.invoice ||
      readBefore?.data ||
      readBefore;
  } catch (error) {
    console.error("SHAM CASH INVOICE READ FAILED:", {
      orderId: String(order._id),
      invoiceNumber: order.shamCashInvoiceNumber,
      providerStatus: error.statusCode,
      providerCode: error.providerCode,
      message: error.message,
    });
    return res.status(502).json({
      status: "fail",
      message: "تعذر التأكد من حالة الفاتورة لدى ShamCash. لم تتغير حالة الطلب",
    });
  }

  const invoiceBeforeNumber = String(
    invoiceBefore?.invoiceNumber || invoiceBefore?.invoice_number || "",
  );
  const invoiceBeforeStatus = String(invoiceBefore?.status || "").toLowerCase();
  if (invoiceBeforeNumber !== String(order.shamCashInvoiceNumber)) {
    return res
      .status(409)
      .json({ status: "fail", message: "بيانات الفاتورة لا تطابق الطلب" });
  }
  if (["expired", "cancelled", "canceled"].includes(invoiceBeforeStatus)) {
    return res.status(409).json({
      status: "fail",
      message:
        "الفاتورة منتهية أو ملغاة. لا تعِد التحويل؛ راجع التحويل السابق مع الدعم قبل إنشاء دفع جديد",
    });
  }
  if (invoiceBeforeStatus !== "pending" && invoiceBeforeStatus !== "paid") {
    return res.status(409).json({
      status: "fail",
      message: "حالة الفاتورة غير معروفة، لم يتم تأكيد الطلب",
    });
  }

  let verifyReply;
  try {
    // Official ShamCash invoice verification requires transactionRef for ShamCash wallets.
    verifyReply = await shamCashApi(`${invoicePath}/verify`, "POST", {
      transactionRef,
    });
  } catch (error) {
    console.error("SHAM CASH VERIFY FAILED:", {
      orderId: String(order._id),
      invoiceNumber: order.shamCashInvoiceNumber,
      providerStatus: error.statusCode,
      providerCode: error.providerCode,
      message: error.message,
    });
    return res.status(409).json({
      status: "fail",
      message:
        "رفض ShamCash ربط رقم العملية بهذه الفاتورة. راجع حالة الفاتورة ورقم العملية، ولا تعِد التحويل",
    });
  }

  if (!verifyReply || typeof verifyReply !== "object") {
    return res

      .status(409)

      .json({
        status: "fail",

        message: "استجابة التحقق من ShamCash غير واضحة",
      });
  }

  let read;

  try {
    read = await getInvoice(order.shamCashInvoiceNumber);
  } catch (_) {
    return res

      .status(502)

      .json({ status: "fail", message: "تعذر قراءة حالة الفاتورة بعد التحقق" });
  }

  const invoice = read?.data?.invoice || read?.invoice || read?.data || read;

  const status = String(invoice?.status || "").toLowerCase();

  const amount = Number(invoice?.amount);

  const currency = String(invoice?.currency || "").toUpperCase();

  const wallet = String(
    invoice?.walletAddress || invoice?.wallet_address || "",
  );

  const number = String(
    invoice?.invoiceNumber || invoice?.invoice_number || "",
  );

  if (
    status !== "paid" ||
    number !== String(order.shamCashInvoiceNumber) ||
    currency !== ORDER_PAYMENT_CURRENCY ||
    wallet !== SHAM_CASH_ACCOUNT_ADDRESS ||
    !Number.isFinite(amount) ||
    Math.abs(amount - Number(order.totalPrice)) > 0.001
  ) {
    return res.status(409).json({
      status: "fail",

      message:
        "لم يؤكد ShamCash دفع نفس الفاتورة بنفس المبلغ والمحفظة؛ لم تتغير حالة الطلب",
    });
  }

  // Guard against a changed/cancelled order while verification was in progress.

  let updated;

  try {
    updated = await Order.findOneAndUpdate(
      {
        _id: order._id,

        status: "pending",

        paymentStatus: "pending",

        shamCashInvoiceNumber: order.shamCashInvoiceNumber,

        shamCashTransactionId: null,
      },

      {
        $set: {
          paymentStatus: "paid",

          shamCashTransactionId: transactionRef,

          shamCashPaymentAmount: amount,

          shamCashPaymentCurrency: ORDER_PAYMENT_CURRENCY,

          shamCashPaymentAt: new Date(),
        },
      },

      { new: true },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return res

        .status(409)

        .json({ status: "fail", message: "رقم التحويل مستخدم بالفعل" });
    }

    throw error;
  }

  if (!updated) {
    return res

      .status(409)

      .json({ status: "fail", message: "حالة الطلب تغيرت أثناء التحقق" });
  }

  return res

    .status(200)

    .json({ status: "success", message: "تم تأكيد دفع الطلب", data: updated });
});

// ===============================

// Create Order

// ===============================

const createOrder = asyncHandler(async (req, res) => {
  const {
    userId,

    items,

    address,

    phone,

    paymentMethod,

    transactionId,
  } = req.body;

  // ===============================

  // Validate Request

  // ===============================

  const { error } = validateCreateOrder({
    userId,

    items,

    address,

    phone,

    paymentMethod,

    transactionId:
      paymentMethod === "sham_cash_wallet" ? undefined : transactionId,
  });

  if (error) {
    return res

      .status(200)

      .json({
        status: "fail",

        message: error.details[0].message,
      });
  }

  // ===============================

  // User

  // ===============================

  const user = await User.findById(userId)

    .select("_id");

  if (!user) {
    return res

      .status(404)

      .json({
        status: "fail",

        message: "المستخدم غير موجود",
      });
  }

  // ===============================

  // Build Order Items

  // ===============================

  const orderItems = [];

  let totalPrice = 0;

  for (const item of items) {
    const ad = await TraderAd.findById(item.adId)

      .populate("trader");

    if (!ad) {
      continue;
    }

    if (ad.adType !== "product") {
      continue;
    }

    const quantity = Number(item.quantity);

    const price = Number(ad.price);

    if (Number.isNaN(quantity) || quantity < 1) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: `الكمية غير صحيحة للمنتج: ${ad.title}`,
        });
    }

    if (Number.isNaN(price) || price < 0) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: `سعر المنتج غير صحيح: ${ad.title}`,
        });
    }

    // ===============================

    // Selected Color

    // ===============================

    let selectedColor =
      item.selectedColor

        ?.toString()

        .trim() || null;

    if (Array.isArray(ad.colors) && ad.colors.length > 0) {
      if (!selectedColor) {
        return res

          .status(200)

          .json({
            status: "fail",

            message: `يجب اختيار اللون للمنتج: ${ad.title}`,
          });
      }

      const colorExists = ad.colors.some(
        (color) =>
          color

            .toString()

            .trim() === selectedColor,
      );

      if (!colorExists) {
        return res

          .status(200)

          .json({
            status: "fail",

            message: `اللون المختار غير متاح للمنتج: ${ad.title}`,
          });
      }
    } else {
      selectedColor = null;
    }

    // ===============================

    // Selected Size

    // ===============================

    let selectedSize =
      item.selectedSize

        ?.toString()

        .trim() || null;

    if (Array.isArray(ad.sizes) && ad.sizes.length > 0) {
      if (!selectedSize) {
        return res

          .status(200)

          .json({
            status: "fail",

            message: `يجب اختيار المقاس للمنتج: ${ad.title}`,
          });
      }

      const sizeExists = ad.sizes.some(
        (size) =>
          size

            .toString()

            .trim() === selectedSize,
      );

      if (!sizeExists) {
        return res

          .status(200)

          .json({
            status: "fail",

            message: `المقاس المختار غير متاح للمنتج: ${ad.title}`,
          });
      }
    } else {
      selectedSize = null;
    }

    // ===============================

    // Item Total

    // ===============================

    const total = price * quantity;

    orderItems.push({
      ad: ad._id,

      trader: ad.trader._id,

      title: ad.title,

      image: ad.image,

      price,

      quantity,

      selectedColor,

      selectedSize,

      total,
    });

    totalPrice += total;
  }

  // ===============================

  // No Valid Products

  // ===============================

  if (!orderItems.length) {
    return res

      .status(200)

      .json({
        status: "fail",

        message: "لا توجد منتجات صالحة في الطلب",
      });
  }

  // ===============================

  // Payment: create order first (pending), then create ShamCash invoice

  // ===============================

  const order = await Order.create({
    user: userId,

    address,

    phone,

    items: orderItems,

    totalPrice,

    paymentMethod,

    paymentStatus: "pending",
  });

  let invoiceDetails = null;

  if (paymentMethod === "sham_cash_wallet") {
    try {
      invoiceDetails = await createOrderInvoice(order);

      order.shamCashInvoiceNumber = invoiceDetails.invoiceNumber;

      await order.save();
    } catch (error) {
      // Do not claim payment success if the invoice could not be created.

      return res.status(error.statusCode || 502).json({
        status: "fail",

        message: error.message,

        orderId: order._id,

        paymentStatus: "pending",
      });
    }
  }

  return res.status(201).json({
    status: "success",

    message:
      paymentMethod === "sham_cash_wallet"
        ? "تم إنشاء الطلب وفاتورة الدفع، في انتظار التحويل"
        : "تم إرسال الطلب بنجاح والدفع عند الاستلام",

    data: order,

    payment: {
      method: order.paymentMethod,

      status: order.paymentStatus,

      currency: ORDER_PAYMENT_CURRENCY,

      amount: totalPrice,

      ...(invoiceDetails
        ? {
            invoiceNumber: invoiceDetails.invoiceNumber,

            accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,

            accountNumber: SHAM_CASH_ACCOUNT_NUMBER,

            accountName: SHAM_CASH_ACCOUNT_NAME,
          }
        : {}),
    },
  });
});

// ===============================

// Get Admin Orders

// ===============================

const getAdminOrders = asyncHandler(
  async (
    req,

    res,
  ) => {
    const orders = await Order.find()

      .sort({
        createdAt: -1,
      })

      .populate(
        "user",

        "fname lname email image phone",
      )

      .populate(
        "items.ad",

        "title category image price colors sizes",
      )

      .populate(
        "items.trader",

        "name phone email institutionName",
      )

      .lean();

    return res

      .status(200)

      .json({
        status: "success",

        count: orders.length,

        orders,
      });
  },
);

// ===============================

// Update Order Status

// ===============================

const updateOrderStatus = asyncHandler(
  async (
    req,

    res,
  ) => {
    const { orderId } = req.params;

    const { status } = req.body;

    if (
      ![
        "pending",

        "accepted",

        "shipped",

        "out_for_delivery",

        "rejected",

        "completed",

        "cancelled",
      ].includes(status)
    ) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "حالة الطلب غير صحيحة",
        });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,

      {
        status,
      },

      {
        new: true,
      },
    );

    if (!order) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "الطلب غير موجود",
        });
    }

    return res

      .status(200)

      .json({
        status: "success",

        message: "تم تحديث حالة الطلب",

        data: order,
      });
  },
);

// ===============================

// Get Trader Orders

// ===============================

const getTraderOrders = asyncHandler(
  async (
    req,

    res,
  ) => {
    const { traderId } = req.params;

    const trader = await Trader.findById(traderId)

      .select("_id");

    if (!trader) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "التاجر غير موجود",
        });
    }

    const orders = await Order.find({
      "items.trader": traderId,
    })

      .sort({
        createdAt: -1,
      })

      .populate(
        "user",

        "fname lname email image phone",
      )

      .populate(
        "items.ad",

        "title category image price colors sizes",
      )

      .populate(
        "items.trader",

        "name phone email institutionName image",
      )

      .lean();

    // يرجع للتاجر المنتجات الخاصة به فقط داخل كل طلب

    const traderOrders = orders.map((order) => {
      const traderItems = order.items.filter((item) => {
        const itemTraderId = item.trader?._id
          ? item.trader._id.toString()
          : item.trader?.toString();

        return itemTraderId === traderId.toString();
      });

      const traderTotal = traderItems.reduce(
        (
          sum,

          item,
        ) => sum + Number(item.total || 0),

        0,
      );

      return {
        ...order,

        items: traderItems,

        traderTotal,
      };
    });

    return res

      .status(200)

      .json({
        status: "success",

        count: traderOrders.length,

        orders: traderOrders,
      });
  },
);

// ===============================

// Update Trader Order Item Status

// ===============================

const updateTraderOrderItemStatus = asyncHandler(
  async (
    req,

    res,
  ) => {
    const {
      orderId,

      itemId,
    } = req.params;

    const {
      traderId,

      status,
    } = req.body;

    if (!orderId || !itemId || !traderId) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "orderId أو itemId أو traderId ناقص",
        });
    }

    const allowedStatuses = [
      "pending",

      "accepted",

      "shipped",

      "out_for_delivery",

      "delivered",

      "rejected",

      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "حالة الطلب غير صحيحة",
        });
    }

    const trader = await Trader.findById(traderId)

      .select("_id");

    if (!trader) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "التاجر غير موجود",
        });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "الطلب غير موجود",
        });
    }

    const item = order.items.id(itemId);

    if (!item) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "المنتج غير موجود داخل الطلب",
        });
    }

    if (item.trader.toString() !== traderId.toString()) {
      return res

        .status(403)

        .json({
          status: "fail",

          message: "غير مسموح لك بتعديل حالة هذا المنتج",
        });
    }

    // منع الرجوع للخلف في الحالات بعد التسليم/الرفض/الإلغاء

    if (["delivered", "rejected", "cancelled"].includes(item.status)) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "لا يمكن تعديل حالة هذا المنتج بعد انتهاء الطلب",
        });
    }

    item.status = status;

    item.statusUpdatedAt = new Date();

    // ===============================

    // Recalculate General Order Status

    // ===============================

    const statuses = order.items.map((orderItem) => orderItem.status);

    if (statuses.every((s) => s === "delivered")) {
      order.status = "completed";
    } else if (statuses.every((s) => s === "rejected")) {
      order.status = "rejected";
    } else if (statuses.every((s) => s === "cancelled")) {
      // ShamCash invoice cancellation must be authorized and confirmed remotely.

      // Cash-on-delivery behavior remains unchanged.

      if (order.paymentMethod === "sham_cash_wallet") {
        const authenticatedUserId = req.user?._id || req.user?.id;

        if (
          !authenticatedUserId ||
          String(authenticatedUserId) !== String(order.user)
        ) {
          return res.status(401).json({
            status: "fail",

            message: "يلزم تسجيل الدخول بصاحب الطلب لإلغاء فاتورة ShamCash",
          });
        }

        if (order.paymentStatus !== "pending" || !order.shamCashInvoiceNumber) {
          return res.status(409).json({
            status: "fail",

            message: "لا يمكن إلغاء فاتورة مدفوعة أو غير محفوظة",
          });
        }

        const number = order.shamCashInvoiceNumber;

        const invoicePath = `/invoices/${encodeURIComponent(number)}`;

        const unwrapInvoice = (reply) =>
          reply?.data?.invoice || reply?.invoice || reply?.data || reply;

        const checkInvoice = (reply) => {
          const invoice = unwrapInvoice(reply);

          const actualNumber = String(
            invoice?.invoiceNumber || invoice?.invoice_number || "",
          );

          const state = String(invoice?.status || "").toLowerCase();

          return { actualNumber, state };
        };

        let before;

        try {
          before = checkInvoice(await getInvoice(number));
        } catch (_) {
          return res

            .status(502)

            .json({ status: "fail", message: "تعذر التأكد من حالة الفاتورة" });
        }

        if (before.actualNumber !== number || before.state !== "pending") {
          return res

            .status(409)

            .json({
              status: "fail",

              message:
                "الفاتورة ليست معلقة أو حالتها غير مؤكدة؛ لن يتم إلغاؤها",
            });
        }

        try {
          await shamCashApi(invoicePath, "DELETE");
        } catch (_) {
          return res

            .status(502)

            .json({
              status: "fail",

              message: "لم تؤكد ShamCash إلغاء الفاتورة",
            });
        }

        let after;

        try {
          after = checkInvoice(await getInvoice(number));
        } catch (_) {
          return res

            .status(502)

            .json({
              status: "fail",

              message: "تم طلب الإلغاء، لكن تعذر تأكيد الحالة من ShamCash",
            });
        }

        if (
          after.actualNumber !== number ||
          !["cancelled", "canceled"].includes(after.state)
        ) {
          return res

            .status(409)

            .json({
              status: "fail",

              message:
                "لم تتأكد حالة الإلغاء من ShamCash، راجع الفاتورة قبل المحاولة ثانية",
            });
        }

        // Conditional update prevents cancelling an order whose payment was recorded meanwhile.

        const cancelled = await Order.findOneAndUpdate(
          {
            _id: order._id,

            user: order.user,

            status: "pending",

            paymentStatus: "pending",
          },

          {
            $set: {
              status: "cancelled",

              "items.$[item].status": "cancelled",

              "items.$[item].statusUpdatedAt": new Date(),
            },
          },

          { new: true, arrayFilters: [{ "item.status": "pending" }] },
        );

        if (!cancelled) {
          return res

            .status(409)

            .json({
              status: "fail",

              message: "حالة الطلب تغيرت، يرجى تحديث الطلب",
            });
        }

        return res

          .status(200)

          .json({
            status: "success",

            message: "تم إلغاء الفاتورة والطلب",

            data: cancelled,
          });
      }

      order.status = "cancelled";
    } else if (statuses.some((s) => s === "out_for_delivery")) {
      order.status = "out_for_delivery";
    } else if (statuses.some((s) => s === "shipped")) {
      order.status = "shipped";
    } else if (statuses.some((s) => s === "accepted")) {
      order.status = "accepted";
    } else {
      order.status = "pending";
    }

    await order.save();

    return res

      .status(200)

      .json({
        status: "success",

        message: "تم تحديث حالة المنتج بنجاح",

        data: {
          orderId: order._id,

          itemId: item._id,

          itemStatus: item.status,

          orderStatus: order.status,

          statusUpdatedAt: item.statusUpdatedAt,
        },
      });
  },
);

// ===============================

// Get User Orders

// ===============================

const getUserOrders = asyncHandler(
  async (
    req,

    res,
  ) => {
    const { userId } = req.params;

    const orders = await Order.find({
      user: userId,
    })

      .sort({
        createdAt: -1,
      })

      .populate(
        "items.ad",

        "title category image price colors sizes",
      )

      .populate(
        "items.trader",

        "name phone email institutionName",
      )

      .lean();

    return res

      .status(200)

      .json({
        status: "success",

        count: orders.length,

        orders,
      });
  },
);

// ===============================

// Cancel User Order

// ===============================

const cancelUserOrder = asyncHandler(
  async (
    req,

    res,
  ) => {
    const { orderId } = req.params;

    const { userId } = req.body;

    if (!orderId || !userId) {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "orderId أو userId ناقص",
        });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res

        .status(404)

        .json({
          status: "fail",

          message: "الطلب غير موجود",
        });
    }

    if (order.user.toString() !== userId.toString()) {
      return res

        .status(403)

        .json({
          status: "fail",

          message: "هذا الطلب لا يخص هذا المستخدم",
        });
    }

    if (order.status !== "pending") {
      return res

        .status(200)

        .json({
          status: "fail",

          message: "لا يمكن إلغاء الطلب بعد مراجعته",
        });
    }

    order.status = "cancelled";

    order.items.forEach((item) => {
      if (item.status === "pending") {
        item.status = "cancelled";

        item.statusUpdatedAt = new Date();
      }
    });

    await order.save();

    return res

      .status(200)

      .json({
        status: "success",

        message: "تم إلغاء الطلب بنجاح",

        data: order,
      });
  },
);

// ===============================

// Get Sham Cash Payment Details

// ===============================

const getOrderShamCashPaymentDetails = asyncHandler(
  async (
    req,

    res,
  ) => {
    if (!SHAM_CASH_ACCOUNT_ADDRESS) {
      return res

        .status(500)

        .json({
          status: "fail",

          message: "Sham Cash account address is not configured",
        });
    }

    return res

      .status(200)

      .json({
        status: "success",

        paymentMethod: "sham_cash_wallet",

        accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,

        currency: ORDER_PAYMENT_CURRENCY,

        message: "حوّل قيمة الطلب إلى محفظة Sham Cash ثم أدخل رقم العملية",
      });
  },
);

// ===============================

// Exports

// ===============================

module.exports = {
  createOrder,

  getAdminOrders,

  updateOrderStatus,

  getTraderOrders,

  updateTraderOrderItemStatus,

  getUserOrders,

  cancelUserOrder,

  getOrderShamCashPaymentDetails,

  verifyOrderShamCashPayment,
};
