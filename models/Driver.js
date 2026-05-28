const mongoose = require('mongoose');
const { Schema } = mongoose;
const Joi = require("joi");
const jwt = require("jsonwebtoken");

// Define Driver Schema with car details and GeoJSON location
const DriverSchema = new Schema({
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
    default: "d.png"
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
  phone: {
    type: Number,
    required: false,
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
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
  type: [Number],
  default: [0, 0],
}
  }
}, {
  timestamps: true
});

DriverSchema.methods.generateToken = function () {
  return jwt.sign(
    { id: this._id, isAdmin: this.isAdmin },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "30d" }
  );
}

// 2dsphere index for geospatial queries
DriverSchema.index({ location: "2dsphere" });

const Driver = mongoose.model("Driver", DriverSchema);

// Validation functions using Joi
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
