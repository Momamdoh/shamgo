const admin = require("firebase-admin");

// const serviceAccount = JSON.parse(
//   process.env.FIREBASE_SERVICE_ACCOUNT
// );

const serviceAccount = require("../sham-go-e0a8b-firebase-adminsdk-fbsvc-5c270d0e4a.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),

    databaseURL:
      "https://sham-go-e0a8b-default-rtdb.firebaseio.com",
  });
}

module.exports = admin;