const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const connectDB = require("../db");

const COLLECTION_NAME = "rateLimits";
const TTL_INDEX_NAME = "rate_limits_expires_at_ttl";
let ttlIndexPromise;

class MongoRateLimitStore {
  constructor({ prefix, collection, now = Date.now } = {}) {
    this.prefix = String(prefix || "default");
    this.collection = collection || null;
    this.now = now;
    this.windowMs = 0;
    this.localKeys = false;
    this.ready = collection ? Promise.resolve() : null;
  }

  init(options) {
    this.windowMs = Number(options.windowMs);
  }

  async getCollection() {
    if (this.collection) return this.collection;
    if (!this.ready) {
      this.ready = connectDB().then(() => {
        const database = mongoose.connection.db;
        if (!database) throw new Error("MongoDB is not connected for shared rate limiting.");
        this.collection = database.collection(COLLECTION_NAME);
        if (!ttlIndexPromise) {
          ttlIndexPromise = this.collection.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: TTL_INDEX_NAME },
          ).catch((error) => {
            ttlIndexPromise = undefined;
            throw error;
          });
        }
        return ttlIndexPromise;
      }).catch((error) => {
        this.ready = null;
        throw error;
      });
    }

    await this.ready;
    return this.collection;
  }

  getDocumentId(key) {
    return createHash("sha256")
      .update(`${this.prefix}:${key}`)
      .digest("hex");
  }

  async increment(key) {
    const collection = await this.getCollection();
    const now = this.now();
    const nowDate = new Date(now);
    const nextExpiry = new Date(now + this.windowMs);
    const documentId = this.getDocumentId(key);
    const activeWindow = { $gt: [{ $ifNull: ["$expiresAt", new Date(0)] }, nowDate] };
    const update = [{
      $set: {
        totalHits: {
          $cond: [
            activeWindow,
            { $add: [{ $ifNull: ["$totalHits", 0] }, 1] },
            1,
          ],
        },
        expiresAt: { $cond: [activeWindow, "$expiresAt", nextExpiry] },
      },
    }];

    let record;
    try {
      record = await collection.findOneAndUpdate(
        { _id: documentId },
        update,
        { upsert: true, returnDocument: "after", includeResultMetadata: false },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await collection.findOneAndUpdate(
        { _id: documentId },
        update,
        { returnDocument: "after", includeResultMetadata: false },
      );
    }

    if (!record) throw new Error("MongoDB did not return the updated rate-limit record.");
    return { totalHits: Number(record.totalHits), resetTime: record.expiresAt };
  }

  async get(key) {
    const collection = await this.getCollection();
    const record = await collection.findOne({ _id: this.getDocumentId(key) });
    if (!record || !(record.expiresAt instanceof Date) || record.expiresAt.getTime() <= this.now()) {
      return undefined;
    }
    return { totalHits: Number(record.totalHits), resetTime: record.expiresAt };
  }

  async decrement(key) {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: this.getDocumentId(key), expiresAt: { $gt: new Date(this.now()) } },
      [{
        $set: {
          totalHits: { $max: [0, { $subtract: [{ $ifNull: ["$totalHits", 0] }, 1] }] },
        },
      }],
    );
  }

  async resetKey(key) {
    const collection = await this.getCollection();
    await collection.deleteOne({ _id: this.getDocumentId(key) });
  }
}

module.exports = MongoRateLimitStore;