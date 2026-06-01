const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { Driver } = require("../models/Driver");

const createDriverMonthlyPaymentIntent = async (req, res) => {
  try {
    const {
      driverId,
      customerEmail,
      currency = "usd",
    } = req.body;

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

    let stripeCustomerId = driver.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerEmail || driver.email,
        name: `${driver.firstname} ${driver.lastname}`,
        metadata: {
          driverId: driver._id.toString(),
          type: "driver_monthly_payment",
        },
      });

      stripeCustomerId = customer.id;

      driver.stripeCustomerId = stripeCustomerId;
      await driver.save();
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100,
      currency: currency.toLowerCase(),
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      receipt_email: customerEmail || driver.email,
      description: "Driver monthly payment - 1 USD",
      metadata: {
        driverId: driver._id.toString(),
        driverEmail: driver.email,
        type: "driver_monthly_payment",
        amount: "1",
        currency: currency.toLowerCase(),
      },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId: stripeCustomerId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.log("Stripe driver payment error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const activateDriverSubscription = async (req, res) => {
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

    driver.isSubscriptionActive = true;
    driver.monthlyPaymentRequired = false;
    driver.lastMonthlyPaymentAt = new Date();

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    driver.subscriptionExpiresAt = nextMonth;

    await driver.save();

    return res.status(200).json({
      success: true,
      message: "Driver subscription activated",
      isSubscriptionActive: driver.isSubscriptionActive,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
    });
  } catch (error) {
    console.log("Activate driver subscription error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const checkDriverSubscription = async (req, res) => {
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

    const now = new Date();

    const isSubscriptionActive =
      driver.isSubscriptionActive === true &&
      driver.subscriptionExpiresAt &&
      new Date(driver.subscriptionExpiresAt) > now;

    if (!isSubscriptionActive && driver.isSubscriptionActive === true) {
      driver.isSubscriptionActive = false;
      driver.monthlyPaymentRequired = true;
      await driver.save();
    }

    return res.status(200).json({
      success: true,
      isSubscriptionActive,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
      monthlyPaymentRequired: !isSubscriptionActive,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const getDriversSubscriptions = async (req, res) => {
  try {
    const drivers = await Driver.find({})
      .select(
        "email firstname lastname phone isSubscriptionActive monthlyPaymentRequired lastMonthlyPaymentAt subscriptionExpiresAt stripeCustomerId"
      )
      .sort({ createdAt: -1 });

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

module.exports = {
  createDriverMonthlyPaymentIntent,
  activateDriverSubscription,
  checkDriverSubscription,
  getDriversSubscriptions,

};