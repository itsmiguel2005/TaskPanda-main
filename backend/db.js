const mongoose = require("mongoose");
const { mongoUri, mongoDbName } = require("./config/env");

mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

let connectionPromise;

async function migrateIdentityIdentifierIndex() {
  const users = mongoose.connection.collection("users");
  let indexes;
  try {
    indexes = await users.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound") throw error;
    await users.createIndex(
      { "verificationDetails.identifierHash": 1 },
      { name: "identity_identifier_hash_lookup" },
    );
    return;
  }

  for (const index of indexes) {
    if (index.key?.["verificationDetails.identifierHash"] === 1 && index.unique === true) {
      try {
        await users.dropIndex(index.name);
        console.log(`Removed unique identity identifier index ${index.name}`);
      } catch (error) {
        if (error.code !== 27 && error.codeName !== "IndexNotFound") throw error;
      }
    }
  }

  indexes = await users.indexes();
  const hasLookupIndex = indexes.some((index) =>
    index.key?.["verificationDetails.identifierHash"] === 1 && index.unique !== true
  );
  if (!hasLookupIndex) {
    await users.createIndex(
      { "verificationDetails.identifierHash": 1 },
      { name: "identity_identifier_hash_lookup" },
    );
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!mongoUri || /<[^>]+>/.test(mongoUri)) {
    throw new Error(
      "MONGO_URI is missing or still contains placeholders. Set the real MongoDB connection string in .env or your deployment environment.",
    );
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoUri, { dbName: mongoDbName }).then(async () => {
      await migrateIdentityIdentifierIndex();
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
