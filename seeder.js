const { Book } = require("./models/Book");
const { Author } = require("./models/Author");
const { books, authors } = require("./data");
const { ConnectToDb } = require("./config/db");
require("dotenv").config();
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK with the service account key
admin.initializeApp({
    credential: admin.credential.cert(require("./e-commerce-d02dc-firebase-adminsdk-jrxbh-cd2ef20d25.json")), // Ensure this path is correct
})

// Connect to the database
ConnectToDb();

// Function to send notifications
const sendNotification = async (title, message, registrationToken) => {
    const payload = {
        notification: {
            title: title,
            body: message,
        },
    };
    try {
        const response = await admin.messaging().send({
            token: registrationToken,  // Token retrieved from your DB
            ...payload,
        });
        console.log("Notification sent successfully:", response);
    } catch (error) {
        console.error("Error sending notification:", error);
    }
};

// Function to import books and send a notification
const importBooks = async () => {
    try {
        await Book.insertMany(books);
        console.log("Books Imported");

        // Get the token from the database (replace this with the actual token)
        const registrationToken = "feCNTNjASR6SAmO_UKPRfb:APA91bH8ssMJUYwpfxXFZyjU4NslgLDTlDz-u103L6MVyPpLKM_noSTAVzdDVR_FmsILoaRUXVPqfhRwsnyQjhat5Y5KrmBsZMZc33wNn7b80gS0DFjoxf8"; // Fetch the token stored in your DB

        await sendNotification("Books Imported", "All books have been successfully imported.", registrationToken);
    } catch (error) {
        console.error("Error importing books:", error);
        process.exit(1);
    }
};

// Function to import authors and send a notification
const importAuthors = async () => {
    try {
        await Author.insertMany(authors);
        console.log("Authors Imported");

        // Get the token from the database (replace this with the actual token)
        const registrationToken = "feCNTNjASR6SAmO_UKPRfb:APA91bH8ssMJUYwpfxXFZyjU4NslgLDTlDz-u103L6MVyPpLKM_noSTAVzdDVR_FmsILoaRUXVPqfhRwsnyQjhat5Y5KrmBsZMZc33wNn7b80gS0DFjoxf8"; // Fetch the token stored in your DB

        await sendNotification("Authors Imported", "All authors have been successfully imported.", registrationToken);
    } catch (error) {
        console.error("Error importing authors:", error);
        process.exit(1);
    }
};

// Function to remove books
const removeBooks = async () => {
    try {
        await Book.deleteMany();
        console.log("Books Removed!");
    } catch (error) {
        console.error("Error removing books:", error);
        process.exit(1);
    }
};

// Command-line handling
if (process.argv[2] === "-import") {
    importBooks();
} else if (process.argv[2] === "-remove") {
    removeBooks();
} else if (process.argv[2] === "-import-authors") {
    importAuthors();
}
