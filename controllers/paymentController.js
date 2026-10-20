const { Driver } = require("../models/Driver");

// ==============================
// SHAM CASH CONFIG
// ==============================

const SHAM_CASH_BASE_URL = "https://apisyria.com/api/v1";

const SHAM_CASH_API_KEY =
  "d66eaa75d8b013c1ce8a56e5c07a436c2e38e3ee1a577d5ddfb2ed5e2169fedf";

// حط هنا account address الحقيقي
const SHAM_CASH_ACCOUNT_ADDRESS = "PUT_SHAM_CASH_ACCOUNT_ADDRESS_HERE";

const MONTHLY_PAYMENT_AMOUNT = 1;
const MONTHLY_PAYMENT_CURRENCY = "USD";

// =====================================================
// 1. GET PAYMENT DETAILS
// =====================================================

const createDriverMonthlyPaymentIntent = async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId is required",
      });
    }

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    return res.status(200).json({
      success: true,
      paymentMethod: "shamcash",
      accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,
      amount: MONTHLY_PAYMENT_AMOUNT,
      currency: MONTHLY_PAYMENT_CURRENCY,
      message:
        "Please transfer 1 USD to the ShamCash account then enter the transaction ID.",
    });
  } catch (error) {
    console.log("ShamCash payment details error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// 2. VERIFY SHAM CASH TRANSACTION + ACTIVATE SUBSCRIPTION
// =====================================================

const activateDriverSubscription = async (req, res) => {
  try {
    const { driverId, transactionId } = req.body;

    // ==============================
    // VALIDATION
    // ==============================

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId is required",
      });
    }

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "transactionId is required",
      });
    }

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // =====================================================
    // PREVENT SAME TRANSACTION FROM BEING USED TWICE
    // =====================================================

    const usedTransaction = await Driver.findOne({
      lastShamCashTransactionId: transactionId,
    });

    if (usedTransaction) {
      return res.status(400).json({
        success: false,
        message: "This transaction has already been used",
      });
    }

    // =====================================================
    // CALL SHAM CASH API
    // =====================================================

    const url =
      `${SHAM_CASH_BASE_URL}` +
      `?resource=shamcash` +
      `&action=find_tx` +
      `&tx=${encodeURIComponent(transactionId)}` +
      `&account_address=${encodeURIComponent(
        SHAM_CASH_ACCOUNT_ADDRESS
      )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": SHAM_CASH_API_KEY,
        Accept: "application/json",
      },
    });

    const result = await response.json();

    console.log("ShamCash verification result:", result);

    // =====================================================
    // API ERROR
    // =====================================================

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message:
          result.error ||
          "Failed to verify ShamCash transaction",
      });
    }

    // =====================================================
    // TRANSACTION NOT FOUND
    // =====================================================

    if (
      !result.success ||
      !result.data ||
      result.data.found !== true
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // =====================================================
    // GET TRANSACTION
    // =====================================================

    const transaction = result.data.transaction;

    if (!transaction) {
      return res.status(400).json({
        success: false,
        message: "Transaction data not found",
      });
    }

    // =====================================================
    // CHECK CURRENCY
    // =====================================================

    if (
      String(transaction.currency).toUpperCase() !==
      MONTHLY_PAYMENT_CURRENCY
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid currency. Expected ${MONTHLY_PAYMENT_CURRENCY}`,
      });
    }

    // =====================================================
    // CHECK AMOUNT
    // =====================================================

    const paidAmount = Number(transaction.amount);

    if (
      Number.isNaN(paidAmount) ||
      paidAmount < MONTHLY_PAYMENT_AMOUNT
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment amount. Expected ${MONTHLY_PAYMENT_AMOUNT} ${MONTHLY_PAYMENT_CURRENCY}`,
        paidAmount,
      });
    }

    // =====================================================
    // ACTIVATE SUBSCRIPTION
    // =====================================================

    driver.isSubscriptionActive = true;

    driver.monthlyPaymentRequired = false;

    driver.lastMonthlyPaymentAt = new Date();

    driver.lastShamCashTransactionId =
      String(transaction.tran_id);

    driver.lastShamCashPaymentAmount =
      Number(transaction.amount);

    driver.lastShamCashPaymentCurrency =
      String(transaction.currency).toUpperCase();

    driver.lastShamCashPaymentAt = new Date();

    // =====================================================
    // ADD ONE MONTH
    // =====================================================

    const nextMonth = new Date();

    nextMonth.setMonth(
      nextMonth.getMonth() + 1
    );

    driver.subscriptionExpiresAt = nextMonth;

    await driver.save();

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      message:
        "Payment verified and driver subscription activated",

      transaction: {
        id: transaction.tran_id,
        amount: transaction.amount,
        currency: transaction.currency,
        fromName: transaction.from_name,
        date: transaction.datetime,
      },

      isSubscriptionActive:
        driver.isSubscriptionActive,

      subscriptionExpiresAt:
        driver.subscriptionExpiresAt,
    });
  } catch (error) {
    console.log(
      "ShamCash activate subscription error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// 3. CHECK DRIVER SUBSCRIPTION
// =====================================================

const checkDriverSubscription = async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId is required",
      });
    }

    const driver =
      await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const now = new Date();

    const isSubscriptionActive =
      driver.isSubscriptionActive === true &&
      driver.subscriptionExpiresAt &&
      new Date(driver.subscriptionExpiresAt) > now;

    if (
      !isSubscriptionActive &&
      driver.isSubscriptionActive === true
    ) {
      driver.isSubscriptionActive = false;

      driver.monthlyPaymentRequired = true;

      await driver.save();
    }

    return res.status(200).json({
      success: true,
      isSubscriptionActive,
      subscriptionExpiresAt:
        driver.subscriptionExpiresAt,
      monthlyPaymentRequired:
        !isSubscriptionActive,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// 4. ADMIN - GET DRIVERS SUBSCRIPTIONS
// =====================================================

const getDriversSubscriptions = async (req, res) => {
  try {
    const drivers =
      await Driver.find({})
        .select(
          "email firstname lastname phone " +
          "isSubscriptionActive " +
          "monthlyPaymentRequired " +
          "lastMonthlyPaymentAt " +
          "subscriptionExpiresAt " +
          "lastShamCashTransactionId " +
          "lastShamCashPaymentAmount " +
          "lastShamCashPaymentCurrency " +
          "lastShamCashPaymentAt"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: drivers.length,
      data: drivers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
};