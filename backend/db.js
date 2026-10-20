const mongoose = require("mongoose");
const { mongoUri, mongoDbName, mongoMaxPoolSize } = require("./config/env");

mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

const mongooseCacheKey = Symbol.for("taskpanda.mongooseConnectionCache");
const mongooseCache = globalThis[mongooseCacheKey] || (globalThis[mongooseCacheKey] = {
  connection: null,
  promise: null,
});

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
  if (mongooseCache.connection?.readyState === 1) return mongooseCache.connection;
  if (mongoose.connection.readyState === 1) {
    mongooseCache.connection = mongoose.connection;
    return mongooseCache.connection;
  }

  if (!mongoUri || /<[^>]+>/.test(mongoUri)) {
    throw new Error(
      "MONGO_URI is missing or still contains placeholders. Set the real MongoDB connection string in .env or your deployment environment.",
    );
  }

  if (!mongooseCache.promise) {
    mongooseCache.promise = mongoose.connect(mongoUri, {
      dbName: mongoDbName,
      maxPoolSize: mongoMaxPoolSize,
    }).then(async () => {
      await migrateIdentityIdentifierIndex();
      mongooseCache.connection = mongoose.connection;
      console.log("MongoDB connected successfully");
      return mongoose.connection;
    });
  }

  try {
    return await mongooseCache.promise;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    mongooseCache.connection = null;
    throw error;
  } finally {
    mongooseCache.promise = null;
  }
}

module.exports = connectDB;
