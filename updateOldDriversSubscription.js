require("dotenv").config();

const mongoose = require("mongoose");
const { Driver } = require("./models/Driver");

async function updateOldDrivers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const drivers = await Driver.find({});

    let updatedCount = 0;

    for (const driver of drivers) {
      let changed = false;

      if (typeof driver.stripeCustomerId === "undefined") {
        driver.stripeCustomerId = null;
        changed = true;
      }

      if (typeof driver.monthlyPaymentRequired === "undefined") {
        driver.monthlyPaymentRequired = true;
        changed = true;
      }

      if (typeof driver.lastMonthlyPaymentAt === "undefined") {
        driver.lastMonthlyPaymentAt = null;
        changed = true;
      }

      if (typeof driver.monthlyPaymentAmount === "undefined") {
        driver.monthlyPaymentAmount = 1;
        changed = true;
      }

      if (typeof driver.monthlyPaymentCurrency === "undefined") {
        driver.monthlyPaymentCurrency = "usd";
        changed = true;
      }

      if (typeof driver.isSubscriptionActive === "undefined") {
        driver.isSubscriptionActive = false;
        changed = true;
      }

      if (typeof driver.subscriptionExpiresAt === "undefined") {
        driver.subscriptionExpiresAt = null;
        changed = true;
      }

      // لو السواق دفع قبل إضافة الحقول
      if (
        driver.monthlyPaymentRequired === false &&
        !driver.isSubscriptionActive
      ) {
        driver.isSubscriptionActive = true;

        const nextMonth = new Date();

        if (driver.lastMonthlyPaymentAt) {
          nextMonth.setTime(
            new Date(driver.lastMonthlyPaymentAt).getTime()
          );
        }

        nextMonth.setMonth(nextMonth.getMonth() + 1);

        driver.subscriptionExpiresAt = nextMonth;

        changed = true;
      }

      if (changed) {
        await driver.save();
        updatedCount++;
      }
    }

    console.log("✅ Drivers updated:", updatedCount);

    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration error:", error);

    process.exit(1);
  }
}

updateOldDrivers();