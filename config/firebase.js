const admin = require("firebase-admin");
const serviceAccount = require("../sham-go-e0a8b-firebase-adminsdk-fbsvc-9a0ef64ad9.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
