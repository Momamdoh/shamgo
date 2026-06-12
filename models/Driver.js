const mongoose = require("mongoose");
const { Schema } = mongoose;
const Joi = require("joi");
const jwt = require("jsonwebtoken");

const DriverSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 100,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    vehicleCategory: {
      type: String,
      enum: ["car", "motorcycle"],
      default: "car",
    },

    firstname: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },

    lastname: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },

    image: {
      type: String,
      default: "d.png",
    },

    isDriver: {
      type: Boolean,
      default: true,
    },

    carType: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    carNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
    },

    completedTripsCount: {
      type: Number,
      default: 0,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    licenseNumber: {
      type: String,
      required: true,
      unique: true,
    },

    nationalId: {
      type: String,
      required: true,
      unique: true,
    },

    verificationCode: {
      type: Number,
    },

    fcmToken: {
      type: String,
      default: null,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    stripeCustomerId: {
      type: String,
      default: null,
    },

    monthlyPaymentRequired: {
      type: Boolean,
      default: true,
    },

    lastMonthlyPaymentAt: {
      type: Date,
      default: null,
    },

    monthlyPaymentAmount: {
      type: Number,
      default: 1,
    },

    monthlyPaymentCurrency: {
      type: String,
      default: "usd",
    },

    isSubscriptionActive: {
      type: Boolean,
      default: false,
    },

    resetPasswordCode: {
      type: Number,
      default: null,
    },

    licenseImage: {
      type: String,
      default: null,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
    },

    subscriptionExpiresAt: {
      type: Date,
      default: null,
    },

    adminApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adminRejectedReason: {
      type: String,
      default: null,
    },

    adminReviewedAt: {
      type: Date,
      default: null,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  {
    timestamps: true,
  },
);

DriverSchema.methods.generateToken = function () {
  return jwt.sign(
    {
      id: this._id,
      role: "driver",
      isAdmin: false,
    },
    process.env.JWT_SECRET_KEY,
    {
      expiresIn: "30d",
    },
  );
};

DriverSchema.index({ location: "2dsphere" });
DriverSchema.index({ isOnline: 1, isVerified: 1, vehicleCategory: 1 });
DriverSchema.index({ monthlyPaymentRequired: 1, lastMonthlyPaymentAt: 1 });

const Driver = mongoose.model("Driver", DriverSchema);

function validateinputdriver(obj) {
  const Schema = Joi.object({
    email: Joi.string().trim().min(5).max(100).required().email(),
    password: Joi.string().min(6).max(100).required(),
    vehicleCategory: Joi.string().valid("car", "motorcycle"),
    firstname: Joi.string().trim().min(3).max(200).required(),
    lastname: Joi.string().trim().min(3).max(200).required(),
    image: Joi.string().uri(),
    carType: Joi.string().trim().min(2).max(100).required(),
    carNumber: Joi.string().trim().min(4).max(20).required(),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    phone: Joi.string().pattern(/^\d+$/).min(11).required(),
    fcmToken: Joi.string().optional(),
  });

  return Schema.validate(obj);
}

function validateupdatedriver(obj) {
  const Schema = Joi.object({
    firstname: Joi.string().trim().min(3).max(200),
    lastname: Joi.string().trim().min(3).max(200),
    password: Joi.string().min(6).max(100).required(),
    vehicleCategory: Joi.string().valid("car", "motorcycle"),
    image: Joi.string().uri(),
    carType: Joi.string().trim().min(2).max(100),
    carNumber: Joi.string().trim().min(4).max(20),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    phone: Joi.string().pattern(/^\d+$/).min(11).required(),
    fcmToken: Joi.string().optional(),
  });

  return Schema.validate(obj);
}

module.exports = {
  Driver,
  validateinputdriver,
  validateupdatedriver,
};
