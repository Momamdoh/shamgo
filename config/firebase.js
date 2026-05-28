const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),

    databaseURL:
      "https://sham-go-e0a8b-default-rtdb.firebaseio.com",
  });
}

module.exports = admin;