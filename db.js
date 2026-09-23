const mongoose = require("mongoose");

mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/taskpanda";

  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
