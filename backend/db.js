const mongoose = require("mongoose");
const { mongoUri } = require("./config/env");

mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

let connectionPromise;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!mongoUri || /<[^>]+>/.test(mongoUri)) {
    throw new Error(
      "MONGO_URI is missing or still contains placeholders. Set the real MongoDB connection string in .env or your deployment environment.",
    );
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoUri).then(() => {
      console.log("MongoDB connected successfully");
      return mongoose.connection;
    });
  }

  try {
    return await connectionPromise;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    connectionPromise = undefined;
    throw error;
  }
}

module.exports = connectDB;
