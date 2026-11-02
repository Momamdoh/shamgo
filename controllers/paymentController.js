// Driver monthly subscriptions using the exact ShamCash invoice API used by product orders.
// 5 SYP for one month; no subscription is activated before invoice verification.
const { Driver } = require("../models/Driver");

const SHAM_CASH_BASE_URL = "https://apis-shamcash.com/api/v1";
// Same merchant credentials used by the existing product ShamCash checkout.
// Move secrets into environment variables and rotate exposed credentials before production.
const SHAM_CASH_API_KEY =
  "sk_3b3a23e17f82e9c7b7f49de2546a5f0568f25bb0c13a29cd571ca3cf81868b93";
const SHAM_CASH_ACCOUNT_ADDRESS = "808a1f30127920b7ae0b6307c47b1164";
const MONTHLY_PAYMENT_AMOUNT = 5;
const MONTHLY_PAYMENT_CURRENCY = "SYP";

const getAuthDriverId = (req) => String(req.user?.id || req.user?._id || "");

function requireDriver(req, res, driverId) {
  if (
    !req.user ||
    req.user.role !== "driver" ||
    getAuthDriverId(req) !== String(driverId)
  ) {
    res
      .status(403)
      .json({ success: false, message: "Driver authorization required" });
    return false;
  }
  return true;
}

function requirePaymentConfig(res) {
  if (!SHAM_CASH_API_KEY || !SHAM_CASH_ACCOUNT_ADDRESS) {
    res
      .status(503)
      .json({
        success: false,
        message: "ShamCash payment configuration is missing",
      });
    return false;
  }
  return true;
}

async function shamCashApi(path, method = "GET", body) {
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
    const error = new Error(result?.message || "ShamCash API request failed");
    error.httpStatus = response.status;
    throw error;
  }
  return result;
}

const unpackInvoice = (response) =>
  response?.data?.invoice || response?.invoice || response?.data || response;
const getInvoice = async (number) =>
  unpackInvoice(await shamCashApi(`/invoices/${encodeURIComponent(number)}`));

// Existing payment-details function becomes invoice creation, as for product orders.
const createDriverMonthlyPaymentIntent = async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId)
      return res
        .status(400)
        .json({ success: false, message: "driverId is required" });
    if (!requireDriver(req, res, driverId) || !requirePaymentConfig(res))
      return;
    const driver = await Driver.findById(driverId);
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    // Do not replace an existing invoice automatically: a driver may have paid it.
    if (driver.subscriptionInvoiceNumber) {
      const invoice = await getInvoice(driver.subscriptionInvoiceNumber);
      const status = String(invoice?.status || "").toLowerCase();
      if (
        String(invoice?.invoiceNumber || invoice?.invoice_number || "") !==
        driver.subscriptionInvoiceNumber
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message: "Existing invoice could not be validated",
          });
      }
      if (
        status === "pending" ||
        (status === "paid" &&
          driver.lastShamCashInvoiceNumber !== driver.subscriptionInvoiceNumber)
      ) {
        return res.status(200).json({
          success: true,
          paymentMethod: "shamcash",
          invoiceNumber: driver.subscriptionInvoiceNumber,
          invoiceStatus: status,
          accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,
          amount: MONTHLY_PAYMENT_AMOUNT,
          currency: MONTHLY_PAYMENT_CURRENCY,
          message:
            status === "paid"
              ? "Existing paid invoice must be verified"
              : "Existing subscription invoice",
        });
      }
      if (
        !["expired", "cancelled", "canceled"].includes(status) &&
        !(
          status === "paid" &&
          driver.lastShamCashInvoiceNumber === driver.subscriptionInvoiceNumber
        )
      ) {
        return res
          .status(409)
          .json({ success: false, message: "Unknown existing invoice status" });
      }
    }

    const result = await shamCashApi("/invoices", "POST", {
      amount: String(MONTHLY_PAYMENT_AMOUNT),
      currency: MONTHLY_PAYMENT_CURRENCY,
      walletAddress: SHAM_CASH_ACCOUNT_ADDRESS,
      expiresInMinutes: 30,
      note: `Sham Go driver monthly subscription ${driver._id}`,
      metadata: {
        paymentType: "driver_subscription",
        driverId: String(driver._id),
      },
    });
    const invoice = unpackInvoice(result);
    const invoiceNumber = String(
      invoice?.invoiceNumber || invoice?.invoice_number || "",
    ).trim();
    if (!invoiceNumber)
      return res
        .status(502)
        .json({
          success: false,
          message:
            "Invoice created without invoice number; manual reconciliation required",
        });

    // If a concurrent request already replaced the invoice, never return this other invoice as authoritative.
    const previous = driver.subscriptionInvoiceNumber || null;
    const saved = await Driver.findOneAndUpdate(
      { _id: driver._id, subscriptionInvoiceNumber: previous },
      {
        $set: {
          subscriptionInvoiceNumber: invoiceNumber,
          subscriptionInvoiceCreatedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!saved)
      return res
        .status(409)
        .json({
          success: false,
          message: "Concurrent invoice request; contact support before paying",
        });

    return res.status(200).json({
      success: true,
      paymentMethod: "shamcash",
      invoiceNumber,
      accountAddress: SHAM_CASH_ACCOUNT_ADDRESS,
      amount: MONTHLY_PAYMENT_AMOUNT,
      currency: MONTHLY_PAYMENT_CURRENCY,
      message:
        "Pay the 5 SYP invoice then verify with the ShamCash transaction reference",
    });
  } catch (error) {
    console.error("Driver invoice create:", error.message);
    return res
      .status(502)
      .json({
        success: false,
        message: "Unable to create or read ShamCash invoice",
      });
  }
};

const activateDriverSubscription = async (req, res) => {
  try {
    const { driverId } = req.body;
    const transactionRef = String(
      req.body.transactionRef || req.body.transactionId || "",
    ).trim();
    if (!driverId || !transactionRef)
      return res
        .status(400)
        .json({
          success: false,
          message: "driverId and transactionRef are required",
        });
    if (!requireDriver(req, res, driverId) || !requirePaymentConfig(res))
      return;
    const driver = await Driver.findById(driverId);
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    const number = driver.subscriptionInvoiceNumber;
    if (!number)
      return res
        .status(409)
        .json({ success: false, message: "Create subscription invoice first" });

    // Idempotent response only for the same already-confirmed payment and invoice.
    if (
      driver.lastShamCashInvoiceNumber === number &&
      driver.lastShamCashTransactionId === transactionRef
    ) {
      return res
        .status(200)
        .json({
          success: true,
          message: "Subscription already activated for this payment",
          isSubscriptionActive: driver.isSubscriptionActive,
          subscriptionExpiresAt: driver.subscriptionExpiresAt,
        });
    }

    const before = await getInvoice(number);
    if (
      String(before?.invoiceNumber || before?.invoice_number || "") !== number
    ) {
      return res
        .status(409)
        .json({ success: false, message: "Invoice mismatch" });
    }
    const state = String(before?.status || "").toLowerCase();
    if (state === "pending") {
      await shamCashApi(
        `/invoices/${encodeURIComponent(number)}/verify`,
        "POST",
        { transactionRef },
      );
    } else if (state !== "paid") {
      return res
        .status(409)
        .json({ success: false, message: "Invoice is not payable" });
    }
    const invoice = await getInvoice(number);
    const amount = Number(invoice?.amount);
    const valid =
      String(invoice?.status || "").toLowerCase() === "paid" &&
      String(invoice?.invoiceNumber || invoice?.invoice_number || "") ===
        number &&
      amount === MONTHLY_PAYMENT_AMOUNT &&
      String(invoice?.currency || "").toUpperCase() ===
        MONTHLY_PAYMENT_CURRENCY &&
      String(
        invoice?.walletAddress ||
          invoice?.wallet_address ||
          invoice?.identifier ||
          "",
      ) === SHAM_CASH_ACCOUNT_ADDRESS &&
      String(invoice?.transactionRef || "") === transactionRef &&
      String(invoice?.metadata?.driverId || "") === String(driver._id) &&
      String(invoice?.metadata?.paymentType || "") === "driver_subscription";
    if (!valid)
      return res
        .status(409)
        .json({
          success: false,
          message:
            "ShamCash did not confirm the same invoice, driver, transaction and amount",
        });

    const now = new Date();
    const start =
      driver.subscriptionExpiresAt && driver.subscriptionExpiresAt > now
        ? driver.subscriptionExpiresAt
        : now;
    const expires = new Date(start);
    expires.setMonth(expires.getMonth() + 1);

    // Atomically activate the subscription only if this exact invoice is still current.
    const updated = await Driver.findOneAndUpdate(
      {
        _id: driver._id,
        subscriptionInvoiceNumber: number,
        lastShamCashInvoiceNumber: { $ne: number },
      },
      {
        $set: {
          isSubscriptionActive: true,
          monthlyPaymentRequired: false,
          lastMonthlyPaymentAt: now,
          monthlyPaymentAmount: MONTHLY_PAYMENT_AMOUNT,
          monthlyPaymentCurrency: MONTHLY_PAYMENT_CURRENCY,
          lastShamCashInvoiceNumber: number,
          lastShamCashTransactionId: transactionRef,
          lastShamCashPaymentAmount: amount,
          lastShamCashPaymentCurrency: MONTHLY_PAYMENT_CURRENCY,
          lastShamCashPaymentAt: now,
          subscriptionExpiresAt: expires,
        },
      },
      { new: true },
    );
    if (!updated)
      return res
        .status(409)
        .json({
          success: false,
          message: "Subscription state changed; refresh status before retrying",
        });
    return res
      .status(200)
      .json({
        success: true,
        message: "Subscription activated after ShamCash invoice confirmation",
        isSubscriptionActive: true,
        subscriptionExpiresAt: updated.subscriptionExpiresAt,
      });
  } catch (error) {
    console.error("Driver invoice verify:", error.message);
    if (error.code === 11000)
      return res
        .status(409)
        .json({ success: false, message: "Transaction already used" });
    return res
      .status(502)
      .json({ success: false, message: "Unable to confirm ShamCash invoice" });
  }
};

const checkDriverSubscription = async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId)
      return res
        .status(400)
        .json({ success: false, message: "driverId is required" });
    if (!requireDriver(req, res, driverId)) return;
    const driver = await Driver.findById(driverId);
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    const active =
      driver.isSubscriptionActive === true &&
      !!driver.subscriptionExpiresAt &&
      driver.subscriptionExpiresAt > new Date();
    if (!active && driver.isSubscriptionActive) {
      await Driver.updateOne(
        { _id: driver._id, isSubscriptionActive: true },
        { $set: { isSubscriptionActive: false, monthlyPaymentRequired: true } },
      );
    }
    return res
      .status(200)
      .json({
        success: true,
        isSubscriptionActive: active,
        subscriptionExpiresAt: driver.subscriptionExpiresAt,
        monthlyPaymentRequired: !active,
      });
  } catch (error) {
    console.error("Driver subscription status:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to check subscription" });
  }
};

const getDriversSubscriptions = async (req, res) => {
  try {
    if (!req.user?.isAdmin)
      return res.status(403).json({ success: false, message: "Admin only" });
    const drivers = await Driver.find({})
      .select(
        "email firstname lastname phone isSubscriptionActive monthlyPaymentRequired lastMonthlyPaymentAt monthlyPaymentAmount monthlyPaymentCurrency subscriptionExpiresAt subscriptionInvoiceNumber lastShamCashInvoiceNumber lastShamCashTransactionId lastShamCashPaymentAmount lastShamCashPaymentCurrency lastShamCashPaymentAt",
      )
      .sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ success: true, count: drivers.length, data: drivers });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Unable to read subscriptions" });
  }
};

module.exports = {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,
};
