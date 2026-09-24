const mongoose = require("mongoose");

mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

let connectionPromise;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured.");
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
