const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { User } = require("../models/User");

const createPaymentIntent = async (req, res) => {
  try {
    const {
      amount = 10,
      currency = "usd",
      customerEmail,
      userId,
      tripId,
      driverId,
      orderId,
      productId,
      description,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerEmail || user.email,
        name: `${user.fname} ${user.lname}`,
        metadata: {
          userId: user._id.toString(),
        },
      });

      stripeCustomerId = customer.id;

      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),

      customer: stripeCustomerId,

      payment_method_types: ["card"],

      receipt_email: customerEmail || user.email,

      description: description || "Cabify payment",

      metadata: {
        userId: user._id.toString(),
        userEmail: user.email,

        tripId: tripId || "",
        driverId: driverId || "",

        orderId: orderId || "",
        productId: productId || "",
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
    console.log("Stripe payment error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createPaymentIntent,
};