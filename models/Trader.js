const mongoose = require("mongoose");
const { Schema } = mongoose;
const Joi = require("joi");
const jwt = require("jsonwebtoken");

const TraderSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 300,
    },
 
    institutionName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
  phone: {
  type: String,
  required: true,
  trim: true,
  unique: true,
},

nationalId: {
  type: String,
  required: true,
  trim: true,
  unique: true,
},
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
    image: {
      type: String,
      default: "d.png",
    },
    isTrader: {
      type: Boolean,
      default: true,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    resetPasswordCode: {
      type: Number,
      default: null,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
    },

    verificationCode: {
      type: Number,
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

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

TraderSchema.methods.generateToken = function () {
  return jwt.sign(
    { id: this._id, isTrader: this.isTrader },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "30d" },
  );
};

const Trader = mongoose.model("Trader", TraderSchema);

function validateInputTrader(obj) {
  const schema = Joi.object({
    name: Joi.string().trim().min(3).max(200).required(),
    address: Joi.string().trim().min(3).max(300).required(),
    phone: Joi.string().trim().required(),
    institutionName: Joi.string().trim().min(2).max(200).required(),
    nationalId: Joi.string().trim().required(),
    email: Joi.string().trim().min(5).max(100).email().required(),
    password: Joi.string().min(6).required(),
    image: Joi.string().optional(),
    fcmToken: Joi.string().optional(),
  });

  return schema.validate(obj);
}

function validateLoginTrader(obj) {
  const schema = Joi.object({
    email: Joi.string().trim().min(5).max(100).email().required(),
    password: Joi.string().min(6).required(),
  });

  return schema.validate(obj);
}

module.exports = {
  Trader,
  validateInputTrader,
  validateLoginTrader,
};
