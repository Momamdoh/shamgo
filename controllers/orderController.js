const asyncHandler = require("express-async-handler");

const {
  Order,
  validateCreateOrder,
} = require("../models/Order");

const { User } = require("../models/User");
const { Trader } = require("../models/Trader");
const { TraderAd } = require("../models/TraderAd");

// ===============================
// SHAM CASH CONFIG
// ===============================

const SHAM_CASH_BASE_URL =
  process.env.SHAM_CASH_BASE_URL ||
  "https://apisyria.com/api/v1";

const SHAM_CASH_API_KEY =
  "d66eaa75d8b013c1ce8a56e5c07a436c2e38e3ee1a577d5ddfb2ed5e2169fedf";

const SHAM_CASH_ACCOUNT_ADDRESS =
  "PUT_SHAM_CASH_ACCOUNT_ADDRESS_HERE";

// أسعار التطبيق عندك بالليرة السورية
const ORDER_PAYMENT_CURRENCY =
  (
    process.env.SHAM_CASH_ORDER_CURRENCY ||
    "SYP"
  ).toUpperCase();

// ===============================
// Verify Sham Cash Transaction
// ===============================

const verifyShamCashTransaction =
  async ({
    transactionId,
    expectedAmount,
  }) => {
    if (!SHAM_CASH_API_KEY) {
      throw new Error(
        "SHAM_CASH_API_KEY is not configured"
      );
    }

    if (!SHAM_CASH_ACCOUNT_ADDRESS) {
      throw new Error(
        "SHAM_CASH_ACCOUNT_ADDRESS is not configured"
      );
    }

    if (
      !transactionId ||
      !transactionId
        .toString()
        .trim()
    ) {
      throw new Error(
        "transactionId is required"
      );
    }

    // ===============================
    // Prevent Transaction Reuse
    // ===============================

    const usedTransaction =
      await Order.findOne({
        shamCashTransactionId:
          transactionId
            .toString()
            .trim(),
      }).select("_id");

    if (usedTransaction) {
      const error =
        new Error(
          "تم استخدام رقم عملية Sham Cash من قبل"
        );

      error.statusCode = 400;

      throw error;
    }

    // ===============================
    // Call Sham Cash API
    // ===============================

    const url =
      `${SHAM_CASH_BASE_URL}` +
      `?resource=shamcash` +
      `&action=find_tx` +
      `&tx=${encodeURIComponent(
        transactionId
          .toString()
          .trim()
      )}` +
      `&account_address=${encodeURIComponent(
        SHAM_CASH_ACCOUNT_ADDRESS
      )}`;

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            "X-Api-Key":
              SHAM_CASH_API_KEY,

            Accept:
              "application/json",
          },
        }
      );

    let result;

    try {
      result =
        await response.json();
    } catch (_) {
      const error =
        new Error(
          "تعذر قراءة رد Sham Cash"
        );

      error.statusCode = 502;

      throw error;
    }

    console.log(
      "SHAM CASH ORDER VERIFY =>",
      result
    );

    // ===============================
    // API Error
    // ===============================

    if (!response.ok) {
      const error =
        new Error(
          result?.error ||
          result?.message ||
          "فشل التحقق من عملية Sham Cash"
        );

      error.statusCode =
        response.status || 502;

      throw error;
    }

    // ===============================
    // Transaction Not Found
    // ===============================

    if (
      !result?.success ||
      !result?.data ||
      result.data.found !== true ||
      !result.data.transaction
    ) {
      const error =
        new Error(
          "عملية Sham Cash غير موجودة"
        );

      error.statusCode = 400;

      throw error;
    }

    const transaction =
      result.data.transaction;

    // ===============================
    // Currency Check
    // ===============================

    const transactionCurrency =
      transaction.currency
        ?.toString()
        .trim()
        .toUpperCase();

    if (
      !transactionCurrency ||
      transactionCurrency !==
        ORDER_PAYMENT_CURRENCY
    ) {
      const error =
        new Error(
          `عملة الدفع غير صحيحة. المطلوب ${ORDER_PAYMENT_CURRENCY}`
        );

      error.statusCode = 400;

      throw error;
    }

    // ===============================
    // Amount Check
    // ===============================

    const paidAmount =
      Number(
        transaction.amount
      );

    const requiredAmount =
      Number(
        expectedAmount
      );

    if (
      Number.isNaN(paidAmount) ||
      paidAmount <
        requiredAmount
    ) {
      const error =
        new Error(
          `المبلغ المدفوع غير كافٍ. المطلوب ${requiredAmount} ${ORDER_PAYMENT_CURRENCY}`
        );

      error.statusCode = 400;

      throw error;
    }

    return {
      id:
        transaction.tran_id
          ?.toString() ||
        transactionId
          .toString(),

      amount:
        paidAmount,

      currency:
        transactionCurrency,

      fromName:
        transaction.from_name
          ?.toString() ||
        null,

      date:
        transaction.datetime ||
        null,

      raw:
        transaction,
    };
  };

// ===============================
// Create Order
// ===============================

const createOrder =
  asyncHandler(
    async (req, res) => {
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

      const { error } =
        validateCreateOrder({
          userId,
          items,
          address,
          phone,
          paymentMethod,
          transactionId,
        });

      if (error) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              error
                .details[0]
                .message,
          });
      }

      // ===============================
      // User
      // ===============================

      const user =
        await User
          .findById(
            userId
          )
          .select("_id");

      if (!user) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "المستخدم غير موجود",
          });
      }

      // ===============================
      // Build Order Items
      // ===============================

      const orderItems = [];

      let totalPrice = 0;

      for (
        const item
        of items
      ) {
        const ad =
          await TraderAd
            .findById(
              item.adId
            )
            .populate(
              "trader"
            );

        if (!ad) {
          continue;
        }

        if (
          ad.adType !==
          "product"
        ) {
          continue;
        }

        const quantity =
          Number(
            item.quantity
          );

        const price =
          Number(
            ad.price
          );

        if (
          Number.isNaN(
            quantity
          ) ||
          quantity < 1
        ) {
          return res
            .status(200)
            .json({
              status:
                "fail",

              message:
                `الكمية غير صحيحة للمنتج: ${ad.title}`,
            });
        }

        if (
          Number.isNaN(
            price
          ) ||
          price < 0
        ) {
          return res
            .status(200)
            .json({
              status:
                "fail",

              message:
                `سعر المنتج غير صحيح: ${ad.title}`,
            });
        }

        // ===============================
        // Selected Color
        // ===============================

        let selectedColor =
          item
            .selectedColor
            ?.toString()
            .trim() ||
          null;

        if (
          Array.isArray(
            ad.colors
          ) &&
          ad.colors.length >
            0
        ) {
          if (
            !selectedColor
          ) {
            return res
              .status(200)
              .json({
                status:
                  "fail",

                message:
                  `يجب اختيار اللون للمنتج: ${ad.title}`,
              });
          }

          const colorExists =
            ad.colors.some(
              (color) =>
                color
                  .toString()
                  .trim() ===
                selectedColor
            );

          if (
            !colorExists
          ) {
            return res
              .status(200)
              .json({
                status:
                  "fail",

                message:
                  `اللون المختار غير متاح للمنتج: ${ad.title}`,
              });
          }
        } else {
          selectedColor =
            null;
        }

        // ===============================
        // Selected Size
        // ===============================

        let selectedSize =
          item
            .selectedSize
            ?.toString()
            .trim() ||
          null;

        if (
          Array.isArray(
            ad.sizes
          ) &&
          ad.sizes.length >
            0
        ) {
          if (
            !selectedSize
          ) {
            return res
              .status(200)
              .json({
                status:
                  "fail",

                message:
                  `يجب اختيار المقاس للمنتج: ${ad.title}`,
              });
          }

          const sizeExists =
            ad.sizes.some(
              (size) =>
                size
                  .toString()
                  .trim() ===
                selectedSize
            );

          if (
            !sizeExists
          ) {
            return res
              .status(200)
              .json({
                status:
                  "fail",

                message:
                  `المقاس المختار غير متاح للمنتج: ${ad.title}`,
              });
          }
        } else {
          selectedSize =
            null;
        }

        // ===============================
        // Item Total
        // ===============================

        const total =
          price *
          quantity;

        orderItems.push({
          ad:
            ad._id,

          trader:
            ad.trader._id,

          title:
            ad.title,

          image:
            ad.image,

          price,

          quantity,

          selectedColor,

          selectedSize,

          total,
        });

        totalPrice +=
          total;
      }

      // ===============================
      // No Valid Products
      // ===============================

      if (
        !orderItems.length
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "لا توجد منتجات صالحة في الطلب",
          });
      }

      // ===============================
      // Payment
      // ===============================

      let paymentStatus =
        "pending";

      let shamCashTransactionId =
        null;

      let shamCashPaymentAmount =
        null;

      let shamCashPaymentCurrency =
        null;

      let shamCashPaymentAt =
        null;

      let shamCashTransaction =
        null;

      // ===============================
      // Cash On Delivery
      // ===============================

      if (
        paymentMethod ===
        "cash_on_delivery"
      ) {
        paymentStatus =
          "pending";
      }

      // ===============================
      // Sham Cash Wallet
      // ===============================

      if (
        paymentMethod ===
        "sham_cash_wallet"
      ) {
        try {
          shamCashTransaction =
            await verifyShamCashTransaction({
              transactionId,

              expectedAmount:
                totalPrice,
            });
        } catch (paymentError) {
          console.log(
            "ORDER SHAM CASH ERROR =>",
            paymentError
          );

          return res
            .status(
              paymentError
                .statusCode ||
              400
            )
            .json({
              status:
                "fail",

              message:
                paymentError
                  .message ||
                "فشل التحقق من الدفع",
            });
        }

        paymentStatus =
          "paid";

        shamCashTransactionId =
          shamCashTransaction.id;

        shamCashPaymentAmount =
          shamCashTransaction.amount;

        shamCashPaymentCurrency =
          shamCashTransaction.currency;

        shamCashPaymentAt =
          new Date();
      }

      // ===============================
      // Create Order
      // ===============================

      const order =
        await Order.create({
          user:
            userId,

          address,

          phone,

          items:
            orderItems,

          totalPrice,

          paymentMethod,

          paymentStatus,

          shamCashTransactionId,

          shamCashPaymentAmount,

          shamCashPaymentCurrency,

          shamCashPaymentAt,
        });

      // ===============================
      // Response
      // ===============================

      return res
        .status(201)
        .json({
          status:
            "success",

          message:
            paymentMethod ===
            "sham_cash_wallet"
              ? "تم التحقق من الدفع وإرسال الطلب بنجاح"
              : "تم إرسال الطلب بنجاح والدفع عند الاستلام",

          data:
            order,

          payment:
            {
              method:
                order
                  .paymentMethod,

              status:
                order
                  .paymentStatus,

              transactionId:
                order
                  .shamCashTransactionId,
            },
        });
    }
  );

// ===============================
// Get Admin Orders
// ===============================

const getAdminOrders =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const orders =
        await Order
          .find()
          .sort({
            createdAt:
              -1,
          })
          .populate(
            "user",
            "fname lname email image phone"
          )
          .populate(
            "items.ad",
            "title category image price colors sizes"
          )
          .populate(
            "items.trader",
            "name phone email institutionName"
          )
          .lean();

      return res
        .status(200)
        .json({
          status:
            "success",

          count:
            orders.length,

          orders,
        });
    }
  );

// ===============================
// Update Order Status
// ===============================

const updateOrderStatus =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        orderId,
      } =
        req.params;

      const {
        status,
      } =
        req.body;

      if (
        ![
          "pending",
          "accepted",
          "shipped",
          "out_for_delivery",
          "rejected",
          "completed",
          "cancelled",
        ].includes(
          status
        )
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "حالة الطلب غير صحيحة",
          });
      }

      const order =
        await Order
          .findByIdAndUpdate(
            orderId,
            {
              status,
            },
            {
              new:
                true,
            }
          );

      if (!order) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "الطلب غير موجود",
          });
      }

      return res
        .status(200)
        .json({
          status:
            "success",

          message:
            "تم تحديث حالة الطلب",

          data:
            order,
        });
    }
  );

// ===============================
// Get Trader Orders
// ===============================
const getTraderOrders =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        traderId,
      } =
        req.params;

      const trader =
        await Trader
          .findById(
            traderId
          )
          .select("_id");

      if (!trader) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "التاجر غير موجود",
          });
      }

      const orders =
        await Order
          .find({
            "items.trader":
              traderId,
          })
          .sort({
            createdAt:
              -1,
          })
          .populate(
            "user",
            "fname lname email image phone"
          )
          .populate(
            "items.ad",
            "title category image price colors sizes"
          )
          .populate(
            "items.trader",
            "name phone email institutionName image"
          )
          .lean();

      // يرجع للتاجر المنتجات الخاصة به فقط داخل كل طلب
      const traderOrders =
        orders.map(
          (order) => {
            const traderItems =
              order.items.filter(
                (item) => {
                  const itemTraderId =
                    item.trader?._id
                      ? item.trader._id.toString()
                      : item.trader?.toString();

                  return (
                    itemTraderId ===
                    traderId.toString()
                  );
                }
              );

            const traderTotal =
              traderItems.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  Number(
                    item.total || 0
                  ),
                0
              );

            return {
              ...order,

              items:
                traderItems,

              traderTotal,
            };
          }
        );

      return res
        .status(200)
        .json({
          status:
            "success",

          count:
            traderOrders.length,

          orders:
            traderOrders,
        });
    }
  );

// ===============================
// Update Trader Order Item Status
// ===============================
const updateTraderOrderItemStatus =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        orderId,
        itemId,
      } =
        req.params;

      const {
        traderId,
        status,
      } =
        req.body;

      if (
        !orderId ||
        !itemId ||
        !traderId
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "orderId أو itemId أو traderId ناقص",
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

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "حالة الطلب غير صحيحة",
          });
      }

      const trader =
        await Trader
          .findById(
            traderId
          )
          .select("_id");

      if (!trader) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "التاجر غير موجود",
          });
      }

      const order =
        await Order
          .findById(
            orderId
          );

      if (!order) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "الطلب غير موجود",
          });
      }

      const item =
        order.items.id(
          itemId
        );

      if (!item) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "المنتج غير موجود داخل الطلب",
          });
      }

      if (
        item.trader
          .toString() !==
        traderId
          .toString()
      ) {
        return res
          .status(403)
          .json({
            status:
              "fail",

            message:
              "غير مسموح لك بتعديل حالة هذا المنتج",
          });
      }

      // منع الرجوع للخلف في الحالات بعد التسليم/الرفض/الإلغاء
      if (
        [
          "delivered",
          "rejected",
          "cancelled",
        ].includes(
          item.status
        )
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "لا يمكن تعديل حالة هذا المنتج بعد انتهاء الطلب",
          });
      }

      item.status =
        status;

      item.statusUpdatedAt =
        new Date();

      // ===============================
      // Recalculate General Order Status
      // ===============================
      const statuses =
        order.items.map(
          (orderItem) =>
            orderItem.status
        );

      if (
        statuses.every(
          (s) =>
            s === "delivered"
        )
      ) {
        order.status =
          "completed";
      } else if (
        statuses.every(
          (s) =>
            s === "rejected"
        )
      ) {
        order.status =
          "rejected";
      } else if (
        statuses.every(
          (s) =>
            s === "cancelled"
        )
      ) {
        order.status =
          "cancelled";
      } else if (
        statuses.some(
          (s) =>
            s === "out_for_delivery"
        )
      ) {
        order.status =
          "out_for_delivery";
      } else if (
        statuses.some(
          (s) =>
            s === "shipped"
        )
      ) {
        order.status =
          "shipped";
      } else if (
        statuses.some(
          (s) =>
            s === "accepted"
        )
      ) {
        order.status =
          "accepted";
      } else {
        order.status =
          "pending";
      }

      await order.save();

      return res
        .status(200)
        .json({
          status:
            "success",

          message:
            "تم تحديث حالة المنتج بنجاح",

          data: {
            orderId:
              order._id,

            itemId:
              item._id,

            itemStatus:
              item.status,

            orderStatus:
              order.status,

            statusUpdatedAt:
              item.statusUpdatedAt,
          },
        });
    }
  );

// ===============================
// Get User Orders
// ===============================

const getUserOrders =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        userId,
      } =
        req.params;

      const orders =
        await Order
          .find({
            user:
              userId,
          })
          .sort({
            createdAt:
              -1,
          })
          .populate(
            "items.ad",
            "title category image price colors sizes"
          )
          .populate(
            "items.trader",
            "name phone email institutionName"
          )
          .lean();

      return res
        .status(200)
        .json({
          status:
            "success",

          count:
            orders.length,

          orders,
        });
    }
  );

// ===============================
// Cancel User Order
// ===============================

const cancelUserOrder =
  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        orderId,
      } =
        req.params;

      const {
        userId,
      } =
        req.body;

      if (
        !orderId ||
        !userId
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "orderId أو userId ناقص",
          });
      }

      const order =
        await Order
          .findById(
            orderId
          );

      if (!order) {
        return res
          .status(404)
          .json({
            status:
              "fail",

            message:
              "الطلب غير موجود",
          });
      }

      if (
        order.user
          .toString() !==
        userId
          .toString()
      ) {
        return res
          .status(403)
          .json({
            status:
              "fail",

            message:
              "هذا الطلب لا يخص هذا المستخدم",
          });
      }

      if (
        order.status !==
        "pending"
      ) {
        return res
          .status(200)
          .json({
            status:
              "fail",

            message:
              "لا يمكن إلغاء الطلب بعد مراجعته",
          });
      }

      order.status =
        "cancelled";

      order.items.forEach(
        (item) => {
          if (
            item.status ===
            "pending"
          ) {
            item.status =
              "cancelled";

            item.statusUpdatedAt =
              new Date();
          }
        }
      );

      await order.save();

      return res
        .status(200)
        .json({
          status:
            "success",

          message:
            "تم إلغاء الطلب بنجاح",

          data:
            order,
        });
    }
  );

// ===============================
// Get Sham Cash Payment Details
// ===============================

const getOrderShamCashPaymentDetails =
  asyncHandler(
    async (
      req,
      res
    ) => {
      if (
        !SHAM_CASH_ACCOUNT_ADDRESS
      ) {
        return res
          .status(500)
          .json({
            status:
              "fail",

            message:
              "Sham Cash account address is not configured",
          });
      }

      return res
        .status(200)
        .json({
          status:
            "success",

          paymentMethod:
            "sham_cash_wallet",

          accountAddress:
            SHAM_CASH_ACCOUNT_ADDRESS,

          currency:
            ORDER_PAYMENT_CURRENCY,

          message:
            "حوّل قيمة الطلب إلى محفظة Sham Cash ثم أدخل رقم العملية",
        });
    }
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
};