const mongoose = require("mongoose");
const Joi = require("joi");

const { Schema } = mongoose;

const TripSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    startLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    driverReachedPickup: {
      type: Boolean,
      default: false,
    },

    destinationLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    startText: {
      type: String,
      default: "",
    },

    destinationText: {
      type: String,
      default: "",
    },

    fname: {
      type: String,
      required: true,
    },

    lname: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
    },

    isAccepted: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "completed", "cancelled"],
      default: "pending",
    },

    interestedDrivers: [
      {
        driverId: {
          type: Schema.Types.ObjectId,
          ref: "Driver",
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        offerTime: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// GeoIndexes
TripSchema.index({ startLocation: "2dsphere" });
TripSchema.index({ destinationLocation: "2dsphere" });

// Performance indexes
TripSchema.index({ user: 1, createdAt: -1 });
TripSchema.index({ driver: 1, createdAt: -1 });
TripSchema.index({ status: 1, createdAt: -1 });
TripSchema.index({ user: 1, status: 1, createdAt: -1 });
TripSchema.index({ driver: 1, isAccepted: 1, status: 1, createdAt: -1 });
TripSchema.index({ "interestedDrivers.driverId": 1 });

const Trip = mongoose.model("Trip", TripSchema);

function validateCreateTrip(obj) {
  const schema = Joi.object({
    userId: Joi.string().required(),
    rideType: Joi.string().valid("car", "motorcycle").required(),
    vehicleCategory: Joi.string().valid("car", "motorcycle").required(),
    price: Joi.number().min(0).required(),
    startLat: Joi.number().min(-90).max(90).required(),
    startLng: Joi.number().min(-180).max(180).required(),
    destinationLat: Joi.number().min(-90).max(90).required(),
    destinationLng: Joi.number().min(-180).max(180).required(),
    fname: Joi.string().required(),
    lname: Joi.string().required(),
    phone: Joi.string().min(7).max(15).required(),
    startText: Joi.string().allow("", null),
    destinationText: Joi.string().allow("", null),
  });

  return schema.validate(obj);
}

module.exports = {
  Trip,
  validateCreateTrip,
};