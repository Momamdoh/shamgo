const axios = require("axios");
const { Trip, validateCreateTrip } = require("../models/trip");
const { Driver } = require("../models/Driver");
const { User } = require("../models/User");
const { Trader } = require("../models/Trader");
const admin = require("../config/firebase");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const getAddressFromCoordinates = async (lat, lng) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=ar`;
  const res = await axios.get(url);
  return res.data.results?.[0]?.formatted_address || "عنوان غير معروف";
};

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

const createTrip = async (req, res) => {
  const { error } = validateCreateTrip(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const {
    userId,
    rideType,
    price,
    startLat,
    startLng,
    destinationLat,
    destinationLng,
    fname,
    lname,
    phone,
    startText,
    destinationText,
    vehicleCategory,
  } = req.body;

  try {
    const [pickupAddress, destinationAddress] = await Promise.all([
      startText
        ? Promise.resolve(startText)
        : getAddressFromCoordinates(startLat, startLng),
      destinationText
        ? Promise.resolve(destinationText)
        : getAddressFromCoordinates(destinationLat, destinationLng),
    ]);

    const drivers = await Driver.find({
      isVerified: true,
      isOnline: true,
      fcmToken: { $ne: null },
      vehicleCategory: vehicleCategory || "car",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(startLng), parseFloat(startLat)],
          },
          $maxDistance: 5000,
        },
      },
    }).limit(20);

    const driversWithinRange = drivers.map((driver) => {
      const [driverLng, driverLat] = driver.location.coordinates;

      const distance = getDistanceFromLatLonInMeters(
        parseFloat(startLat),
        parseFloat(startLng),
        driverLat,
        driverLng,
      );

      return { driver, distance };
    });

    if (driversWithinRange.length === 0) {
      return res.status(200).json({
        status: "fail",
        message: "No Driver IN Area",
      });
    }

    const trip = new Trip({
      user: userId,
      rideType,
      price,
      startLocation: {
        type: "Point",
        coordinates: [parseFloat(startLng), parseFloat(startLat)],
      },
      destinationLocation: {
        type: "Point",
        coordinates: [parseFloat(destinationLng), parseFloat(destinationLat)],
      },
      startText: pickupAddress,
      destinationText: destinationAddress,
      fname,
      lname,
      phone,
      isAccepted: false,
      status: "pending",
    });

    await trip.save();

    const db = admin.database();

    await db.ref(`tripsLive/${trip._id.toString()}`).set({
      tripId: trip._id.toString(),
      userId: userId.toString(),
      status: "pending",
      startLat: parseFloat(startLat),
      startLng: parseFloat(startLng),
      destinationLat: parseFloat(destinationLat),
      destinationLng: parseFloat(destinationLng),
      driverId: "",
      lat: "",
      lng: "",
      updatedAt: Date.now(),
    });

    const driversToNotify = driversWithinRange
      .filter(({ driver }) => driver.isOnline === true)
      .filter(({ driver }) => driver.fcmToken);

    await Promise.all(
      driversToNotify.map(({ driver }) => {
        const message = {
          notification: {
            title: "New Trip Request",
            body: `A passenger requested a ${
              vehicleCategory === "motorcycle" ? "motorcycle" : "car"
            } ride`,
          },
          data: {
            route: "/homeDriver",
            senderId: userId.toString(),
            receiverId: driver._id.toString(),
            tripId: trip._id.toString(),
            rideType,
            vehicleCategory: (vehicleCategory || "car").toString(),
            userId: userId.toString(),
            price: price.toString(),
            startLat: startLat.toString(),
            startLng: startLng.toString(),
            destinationLat: destinationLat.toString(),
            destinationLng: destinationLng.toString(),
            startText: pickupAddress,
            destinationText: destinationAddress,
            fname,
            lname,
            phone,
          },
          token: driver.fcmToken,
        };

        return admin
          .messaging()
          .send(message)
          .then(() => {})
          .catch((err) => {
            console.error("❌ فشل إرسال إشعار:", driver._id.toString(), err);
          });
      }),
    );

    return res.status(201).json({
      status: "success",
      tripId: trip._id.toString(),
      message: "Trip created successfully",
      trip,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "حدث خطأ أثناء معالجة الرحلة" });
  }
};

const getTripsByUser = async (req, res) => {
  const userId = req.params.userId;

  try {
    const page = parseInt(req.query.page || "1");
    const limit = Math.min(parseInt(req.query.limit || "20"), 50);
    const skip = (page - 1) * limit;

    const trips = await Trip.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("driver", "firstname lastname carType carNumber image")
      .populate("user", "fname lname email");

    return res.status(200).json(trips);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "حدث خطأ أثناء جلب الرحلات" });
  }
};

const offerTrip = async (req, res) => {
  const { tripId, driverId, price } = req.body;

  try {
    let trip = await Trip.findOneAndUpdate(
      {
        _id: tripId,
        isAccepted: false,
        driver: null,
        "interestedDrivers.driverId": driverId,
      },
      {
        $set: {
          "interestedDrivers.$.price": price,
        },
      },
      { new: true },
    );

    if (!trip) {
      trip = await Trip.findOneAndUpdate(
        {
          _id: tripId,
          isAccepted: false,
          driver: null,
          "interestedDrivers.driverId": { $ne: driverId },
        },
        {
          $push: {
            interestedDrivers: {
              driverId,
              price,
            },
          },
        },
        { new: true },
      );
    }

    if (!trip) {
      return res
        .status(400)
        .json({ error: "الرحلة غير موجودة أو تم اختيار سائق بالفعل" });
    }

    const [user, driver] = await Promise.all([
      User.findById(trip.user),
      Driver.findById(driverId),
    ]);

    if (!driver) {
      return res.status(404).json({ error: "السائق غير موجود" });
    }

    if (!user?.fcmToken || user.isOnline !== true) {
    } else {
      try {
        const firebaseResult = await admin.messaging().send({
          notification: {
            title: "New Offer",
            body: `${driver.firstname || "A driver"} offered ${price} EGP`,
          },
          data: {
            route: "/tripStatus",
            senderId: driver._id.toString(),
            receiverId: user._id.toString(),
            tripId: trip._id?.toString() || "",
            driverId: driver._id?.toString() || "",
            firstname: driver.firstname?.toString() || "",
            lastname: driver.lastname?.toString() || "",
            carType: driver.carType?.toString() || "",
            carNumber: driver.carNumber?.toString() || "",
            phone: driver.phone?.toString() || "",
            price: price?.toString() || "",
            image: driver.image?.toString() || "",
          },
          token: user.fcmToken,
        });
      } catch (sendError) {}
    }

    return res.status(200).json({ status: "success", message: "Offer Sent" });
  } catch (err) {
    console.error("❌ Error in offerTrip:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال العرض" });
  }
};

const selectDriver = async (req, res) => {
  const { tripId, driverId, userId } = req.body;

  if (!tripId || !driverId || !userId) {
    return res
      .status(400)
      .json({ error: "tripId و driverId و userId مطلوبين" });
  }

  try {
    const oldTrip = await Trip.findOne({
      _id: tripId,
      user: userId,
      isAccepted: false,
      status: "pending",
      "interestedDrivers.driverId": driverId,
    });

    if (!oldTrip) {
      return res
        .status(400)
        .json({ error: "الرحلة غير متاحة أو العرض غير صالح" });
    }

    const driverOffer = oldTrip.interestedDrivers.find(
      (d) => d.driverId.toString() === driverId,
    );

    if (!driverOffer || typeof driverOffer.price === "undefined") {
      return res.status(400).json({ error: "العرض غير صالح" });
    }

    const trip = await Trip.findOneAndUpdate(
      {
        _id: tripId,
        user: userId,
        isAccepted: false,
        status: "pending",
        "interestedDrivers.driverId": driverId,
      },
      {
        $set: {
          driver: driverId,
          isAccepted: true,
          status: "accepted",
          price: driverOffer.price,
          interestedDrivers: [],
        },
      },
      { new: true },
    );

    if (!trip) {
      return res
        .status(400)
        .json({ error: "تم اختيار سائق بالفعل لهذه الرحلة" });
    }

    const [driver, user] = await Promise.all([
      Driver.findById(driverId),
      User.findById(userId),
    ]);

    if (!driver || !user) {
      return res.status(404).json({ error: "السائق أو الراكب غير موجود" });
    }

    const driverLat = driver.location?.coordinates?.[1];
    const driverLng = driver.location?.coordinates?.[0];

    await admin.database().ref(`tripsLive/${trip._id.toString()}`).update({
      driverId: driver._id.toString(),
      lat: driverLat,
      lng: driverLng,
      status: "accepted",
      reachedPickup: false,
      driverReachedPickup: false,
      updatedAt: Date.now(),
    });

    const tripData = {
      _id: trip._id.toString(),
      price: trip.price,
      startText: trip.startText || "",
      destinationText: trip.destinationText || "",
      startLocation: trip.startLocation,
      destinationLocation: trip.destinationLocation,
      fname: user.fname || "",
      lname: user.lname || "",
      phone: user.phone || "",
      isAccepted: true,
      driver: driverId.toString(),
    };

    const driverLocation = {
      lat: driver.location?.coordinates?.[1] ?? "",
      lng: driver.location?.coordinates?.[0] ?? "",
    };

    if (driver?.fcmToken && driver.isOnline === true) {
      await admin.messaging().send({
        notification: {
          title: "Trip Confirmed",
          body: `You have been selected for a trip worth ${driverOffer.price} EGP`,
        },
        data: {
          route: "/acceptedTrip",
          senderId: user._id.toString(),
          receiverId: driver._id.toString(),
          tripId: trip._id.toString(),
          price: driverOffer.price.toString(),
          trip: JSON.stringify(tripData),
          driverLocation: JSON.stringify(driverLocation),
        },
        token: driver.fcmToken,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Driver selected successfully and notification sent",
      trip,
      driverLocation,
      driver,
    });
  } catch (err) {
    console.error("❌ selectDriver error:", err);
    return res.status(500).json({ error: "خطأ أثناء اختيار السائق" });
  }
};

const refuseTrip = async (req, res) => {
  const { tripId } = req.body;

  try {
    const trip = await Trip.findById(tripId);
    if (!trip)
      return res.status(404).json({ error: "لم يتم العثور على الرحلة" });

    if (trip.status === "cancelled") {
      return res.status(400).json({ error: "الرحلة ملغاة بالفعل" });
    }

    trip.status = "cancelled";
    await trip.save();

    const user = await User.findById(trip.user);
    if (user?.fcmToken && user.isOnline === true) {
      await admin.messaging().send({
        notification: {
          title: "Trip Cancelled",
          body: "The driver cancelled the trip. Please request a new trip.",
        },
        data: {
          route: "/home",
          senderId: trip.driver ? trip.driver.toString() : "",
          receiverId: user._id.toString(),
          tripId: trip._id.toString(),
        },
        token: user.fcmToken,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Trip cancelled successfully",
    });
  } catch (err) {
    console.error("❌ Error in refuseTrip:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إلغاء الرحلة" });
  }
};

const sendChatNotification = async (req, res) => {
  const { receiverId, senderId, senderName, text, receiverType } = req.body;

  try {
    const receiver =
      (await User.findById(receiverId)) ||
      (await Driver.findById(receiverId)) ||
      (await Trader.findById(receiverId));

    if (!receiver || !receiver.fcmToken || receiver.isOnline !== true) {
      return res.status(404).json({ error: "المستلم غير متاح الآن" });
    }

    const message = {
     notification: {
  title: "New Message",
  body: `${senderName}: ${
    text.length > 30 ? `${text.substring(0, 30)}...` : text
  }`,
},
      data: {
        route: "/chat",
        senderName,
        senderId: senderId?.toString() || "",
        senderType: req.body.senderType?.toString() || "",
        receiverId: receiverId?.toString() || "",
        receiverType: receiverType?.toString() || "",
        message: text,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      token: receiver.fcmToken,
    };

    try {
      const firebaseResult = await admin.messaging().send(message);

return res.status(200).json({
  message: "Notification sent successfully",
});
    } catch (err) {
      console.error("❌ فشل إرسال الإشعار:", err);
      return res.status(500).json({ error: "فشل إرسال الإشعار" });
    }
  } catch (err) {
    console.error("❌ Error in sendChatNotification:", err);
    return res.status(500).json({ error: "فشل إرسال الإشعار" });
  }
};

const getActiveDriverTrip = async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        status: "fail",
        message: "driverId is required",
      });
    }

    const trip = await Trip.findOne({
      driver: driverId,
      isAccepted: true,
      status: { $in: ["accepted", "started"] },
    }).sort({ createdAt: -1 });

    if (!trip) {
      return res.status(200).json({
        status: "empty",
        message: "No active trip",
      });
    }

    const driver = await Driver.findById(driverId);
    const user = await User.findById(trip.user);

    if (!driver) {
      return res.status(404).json({
        status: "fail",
        message: "Driver not found",
      });
    }

    const driverLat = driver.location?.coordinates?.[1];
    const driverLng = driver.location?.coordinates?.[0];

    const pickupLat = trip.startLocation.coordinates[1];
    const pickupLng = trip.startLocation.coordinates[0];

    const distanceToPickup = getDistanceFromLatLonInMeters(
      driverLat,
      driverLng,
      pickupLat,
      pickupLng,
    );
    console.log("🚕 DISTANCE TO PICKUP:", distanceToPickup);
    console.log("🚕 driverReachedPickup:", trip.driverReachedPickup);
    console.log("🚕 driver:", driverLat, driverLng);
    console.log("🚕 pickup:", pickupLat, pickupLng);

    if (distanceToPickup <= 20 && !trip.driverReachedPickup) {
      console.log("🔥 DRIVER REACHED PICKUP");

      trip.driverReachedPickup = true;
      trip.status = "started";
      await trip.save();

      await admin.database().ref(`tripsLive/${trip._id.toString()}`).update({
        status: "started",
        reachedPickup: true,
        driverReachedPickup: true,

        lat: driverLat,
        lng: driverLng,

        destinationLat: trip.destinationLocation.coordinates[1],
        destinationLng: trip.destinationLocation.coordinates[0],

        updatedAt: Date.now(),
      });

      if (user?.fcmToken && user.isOnline === true) {
        await admin.messaging().send({
         notification: {
  title: "Driver Arrived",
  body: "Your driver has arrived",
},
          data: {
            route: "/tripStarted",
            senderId: driver._id.toString(),
            receiverId: user._id.toString(),
            tripId: trip._id.toString(),
          },
          token: user.fcmToken,
        });
      }
    }

    return res.status(200).json({
      status: "success",
      reachedPickup: trip.driverReachedPickup,
      trip: {
        _id: trip._id.toString(),
        startText: trip.startText || "",
        destinationText: trip.destinationText || "",
        price: trip.price,
        fname: trip.fname || "",
        lname: trip.lname || "",
        phone: trip.phone || "",
        image: user?.image || "",
        user: trip.user ? trip.user.toString() : "",
        startLocation: trip.startLocation,
        destinationLocation: trip.destinationLocation,
      },
      driverLocation: {
        lat: driverLat,
        lng: driverLng,
      },
    });
  } catch (err) {
    console.error("getActiveDriverTrip error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const getActiveUserTrip = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "userId is required",
      });
    }

    const trip = await Trip.findOne({
      user: userId,
      status: { $in: ["pending", "accepted"] },
    }).sort({ createdAt: -1 });

    if (!trip) {
      return res.status(200).json({
        status: "empty",
        message: "No active trip",
      });
    }

    let driverLocation = null;
    let driverData = null;

    if (trip.driver) {
      const driver = await Driver.findById(trip.driver);

      if (driver) {
        driverData = {
          _id: driver._id.toString(),
          firstname: driver.firstname || "",
          lastname: driver.lastname || "",
          image: driver.image || "",
          phone: driver.phone ? driver.phone.toString() : "",
          carType: driver.carType || "",
          carNumber: driver.carNumber || "",
        };
      }

      if (driver?.location?.coordinates?.length === 2) {
        driverLocation = {
          lat: driver.location.coordinates[1],
          lng: driver.location.coordinates[0],
        };
      }
    }

    return res.status(200).json({
      status: "success",
      tripId: trip._id.toString(),
      tripStatus: trip.status,
      isAccepted: trip.isAccepted,
      reachedPickup: trip.driverReachedPickup,
      trip: {
        _id: trip._id.toString(),
        startLocation: trip.startLocation,
        destinationLocation: trip.destinationLocation,
        driver: trip.driver ? trip.driver.toString() : null,
      },
      driverLocation,
      driver: driverData,
    });
  } catch (err) {
    console.error("getActiveUserTrip error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const getDriverLiveLocation = async (req, res) => {
  try {
    const { tripId } = req.body;

    const trip = await Trip.findById(tripId);

    if (!trip || !trip.driver) {
      return res.status(404).json({
        status: "fail",
        message: "Trip not found",
      });
    }

    const driver = await Driver.findById(trip.driver);

    if (!driver?.location?.coordinates) {
      return res.status(404).json({
        status: "fail",
        message: "Driver location not found",
      });
    }

    return res.status(200).json({
      status: "success",
      lat: driver.location.coordinates[1],
      lng: driver.location.coordinates[0],
      reachedPickup: trip.driverReachedPickup,
      destinationLocation: trip.destinationLocation,
    });
  } catch (err) {
    console.error("getDriverLiveLocation error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const completeTrip = async (req, res) => {
  try {
    const { tripId } = req.body;

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        status: "fail",
        message: "Trip not found",
      });
    }

    trip.status = "completed";

    await trip.save();

    if (trip.driver) {
  await Driver.findByIdAndUpdate(trip.driver, {
    $inc: { completedTripsCount: 1 },
  });
}

    const user = await User.findById(trip.user);

    const driver = await Driver.findById(trip.driver);

    if (user?.fcmToken && user.isOnline === true) {
      await admin.messaging().send({
       notification: {
  title: "Trip Completed",
  body: "Thank you for riding with us",
},
        data: {
          route: "/home",
          senderId: driver?._id?.toString() || "",
          receiverId: user._id.toString(),
          tripId: trip._id.toString(),
        },
        token: user.fcmToken,
      });
    }

    if (driver?.fcmToken && driver.isOnline === true) {
      await admin.messaging().send({
      notification: {
  title: "Trip Completed",
  body: "You are now available to receive new trip requests",
},
        data: {
          route: "/homeDriver",
          senderId: user?._id?.toString() || "",
          receiverId: driver._id.toString(),
          tripId: trip._id.toString(),
        },
        token: driver.fcmToken,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Trip completed successfully",
    });
  } catch (err) {
    console.error("completeTrip error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const cancelTripByUser = async (req, res) => {
  try {
    const { tripId, userId } = req.body;

    if (!tripId || !userId) {
      return res.status(400).json({
        status: "fail",
        message: "tripId و userId مطلوبين",
      });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        status: "fail",
       message: "Trip not found",
      });
    }

    if (trip.user.toString() !== userId) {
      return res.status(403).json({
        status: "fail",
       message: "You are not authorized to cancel this trip",
      });
    }

    if (trip.status === "cancelled") {
      return res.status(400).json({
        status: "fail",
        message: "Trip has already been cancelled",
      });
    }

    const driver = trip.driver ? await Driver.findById(trip.driver) : null;

    trip.status = "cancelled";
    trip.isAccepted = false;
    await trip.save();

    if (driver?.fcmToken && driver.isOnline === true) {
      await admin.messaging().send({
        notification: {
  title: "Trip Cancelled",
  body: "The passenger cancelled the trip. You can now accept new trip requests.",
},
        data: {
          route: "/tripCancelled",
          senderId: userId.toString(),
          receiverId: driver._id.toString(),
          tripId: trip._id.toString(),
          cancelledBy: "user",
        },
        token: driver.fcmToken,
      });
    }

    await admin.database().ref(`tripsLive/${trip._id.toString()}`).update({
      status: "cancelled",
      cancelledBy: "user",
      updatedAt: Date.now(),
    });

    return res.status(200).json({
      status: "success",
      message: "Trip cancelled by passenger",
    });
  } catch (err) {
    console.error("cancelTripByUser error:", err);
    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const cancelTripByDriver = async (req, res) => {
  try {
    const { tripId, driverId } = req.body;

    if (!tripId || !driverId) {
      return res.status(400).json({
        status: "fail",
        message: "tripId و driverId مطلوبين",
      });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        status: "fail",
        message: "الرحلة غير موجودة",
      });
    }

    if (!trip.driver || trip.driver.toString() !== driverId) {
      return res.status(403).json({
        status: "fail",
        message: "غير مصرح لك بإلغاء هذه الرحلة",
      });
    }

    if (trip.status === "cancelled") {
      return res.status(400).json({
        status: "fail",
        message: "Trip has already been cancelled",
      });
    }

    const user = await User.findById(trip.user);

    trip.status = "cancelled";
    trip.isAccepted = false;
    await trip.save();

    if (user?.fcmToken && user.isOnline === true) {
      await admin.messaging().send({
       notification: {
  title: "Trip Cancelled",
  body: "The driver cancelled the trip. You can request a new trip now.",
},
        data: {
          route: "/tripCancelled",
          senderId: driverId.toString(),
          receiverId: user._id.toString(),
          tripId: trip._id.toString(),
          cancelledBy: "driver",
        },
        token: user.fcmToken,
      });
    }

    await admin.database().ref(`tripsLive/${trip._id.toString()}`).update({
      status: "cancelled",
      cancelledBy: "driver",
      updatedAt: Date.now(),
    });

    return res.status(200).json({
      status: "success",
     message: "Trip cancelled by driver",
    });
  } catch (err) {
    console.error("cancelTripByDriver error:", err);
    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const updateTripPriceByUser = async (req, res) => {
  const { tripId, userId, price } = req.body;

  if (!tripId || !userId || !price) {
    return res.status(400).json({
      status: "fail",
      message: "tripId و userId و price مطلوبين",
    });
  }

  try {
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        status: "fail",
      message: "Trip not found",
      });
    }

    if (trip.user.toString() !== userId) {
      return res.status(403).json({
        status: "fail",
       message: "You are not authorized to update the price of this trip",
      });
    }

    if (trip.isAccepted || trip.status !== "pending") {
      return res.status(400).json({
        status: "fail",
       message: "The trip price cannot be updated after the trip has been accepted",
      });
    }

    trip.price = price;
    await trip.save();

    const [user, drivers] = await Promise.all([
      User.findById(userId),
      Driver.find({
        isVerified: true,
        isOnline: true,
        fcmToken: { $ne: null },
        vehicleCategory: trip.rideType || "car",
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: trip.startLocation.coordinates,
            },
            $maxDistance: 5000,
          },
        },
      }).limit(20),
    ]);

    for (const driver of drivers) {
      try {
        await admin.messaging().send({
         notification: {
  title: "Trip Price Updated",
  body: `The passenger increased the trip price to ${price} EGP`,
},
          data: {
            route: "/homeDriver",
            type: "trip_price_updated",
            senderId: userId.toString(),
            receiverId: driver._id.toString(),
            tripId: trip._id.toString(),
            rideType: trip.rideType?.toString() || "car",
            vehicleCategory: trip.rideType?.toString() || "car",
            userId: userId.toString(),
            price: price.toString(),
            startLat: trip.startLocation.coordinates[1].toString(),
            startLng: trip.startLocation.coordinates[0].toString(),
            destinationLat: trip.destinationLocation.coordinates[1].toString(),
            destinationLng: trip.destinationLocation.coordinates[0].toString(),
            startText: trip.startText || "",
            destinationText: trip.destinationText || "",
            fname: user?.fname || "",
            lname: user?.lname || "",
            phone: user?.phone || "",
          },
          token: driver.fcmToken,
        });
      } catch (err) {}
    }

    return res.status(200).json({
      status: "success",
    message: "Trip price updated successfully and drivers have been notified",
      price: trip.price,
    });
  } catch (err) {
    console.error("updateTripPriceByUser error:", err);
    return res.status(500).json({
      status: "fail",
     message: "An error occurred while updating the trip price",
    });
  }
};

const getAllUserTrips = async (req, res) => {
  try {
    const userId = req.params.userId || req.body.userId || req.query.userId;

    const page = parseInt(req.query.page || "1");
    const limit = Math.min(parseInt(req.query.limit || "20"), 50);
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "userId is required",
      });
    }

    const trips = await Trip.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fname lname email phone image isOnline")
      .populate(
        "driver",
        "firstname lastname phone image carType carNumber vehicleCategory isOnline location",
      )
      .populate(
        "interestedDrivers.driverId",
        "firstname lastname phone image carType carNumber vehicleCategory",
      );

    return res.status(200).json({
      status: "success",
      page,
      limit,
      count: trips.length,
      hasMore: trips.length === limit,
      trips,
    });
  } catch (err) {
    console.error("getAllUserTrips error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

const getAllDriverTrips = async (req, res) => {
  try {
    const driverId =
      req.params.driverId || req.body.driverId || req.query.driverId;

    const page = parseInt(req.query.page || "1");
    const limit = Math.min(parseInt(req.query.limit || "20"), 50);
    const skip = (page - 1) * limit;

    if (!driverId) {
      return res.status(400).json({
        status: "fail",
        message: "driverId is required",
      });
    }

    const trips = await Trip.find({
      $or: [{ driver: driverId }, { "interestedDrivers.driverId": driverId }],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fname lname email phone image isOnline")
      .populate(
        "driver",
        "firstname lastname phone image carType carNumber vehicleCategory isOnline location",
      )
      .populate(
        "interestedDrivers.driverId",
        "firstname lastname phone image carType carNumber vehicleCategory",
      );

    return res.status(200).json({
      status: "success",
      page,
      limit,
      count: trips.length,
      hasMore: trips.length === limit,
      trips,
    });
  } catch (err) {
    console.error("getAllDriverTrips error:", err);

    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

module.exports = {
  createTrip,
  getTripsByUser,
  offerTrip,
  selectDriver,
  refuseTrip,
  sendChatNotification,
  getActiveDriverTrip,
  getActiveUserTrip,
  getDriverLiveLocation,
  completeTrip,
  cancelTripByUser,
  cancelTripByDriver,
  updateTripPriceByUser,
  getAllUserTrips,
  getAllDriverTrips,
};
