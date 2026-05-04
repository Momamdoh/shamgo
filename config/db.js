const mongoose = require("mongoose");

async function ConnectToDb() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database Successfully");
    } catch (error) {
        console.error("Failed to connect to Database:", error.message);
        process.exit(1); // Exit the process if connection fails
    }
}

module.exports = {
    ConnectToDb
};
