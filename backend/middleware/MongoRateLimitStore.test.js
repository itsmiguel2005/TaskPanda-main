const test = require("node:test");
const assert = require("node:assert/strict");
const MongoRateLimitStore = require("./MongoRateLimitStore");

class FakeMongoCollection {
  constructor() {
    this.records = new Map();
  }

  async findOneAndUpdate(filter, pipeline) {
    const fields = pipeline[0].$set;
    const now = fields.expiresAt.$cond[0].$gt[1];
    const nextExpiry = fields.expiresAt.$cond[2];
    const current = this.records.get(filter._id);
    const active = current?.expiresAt instanceof Date && current.expiresAt > now;
    const record = {
      _id: filter._id,
      totalHits: active ? current.totalHits + 1 : 1,
      expiresAt: active ? current.expiresAt : nextExpiry,
    };
    this.records.set(filter._id, record);
    return { ...record };
  }

  async findOne(filter) {
    const record = this.records.get(filter._id);
    return record ? { ...record } : null;
  }

  async updateOne(filter, pipeline) {
    const current = this.records.get(filter._id);
    if (!current || current.expiresAt <= filter.expiresAt.$gt) return;
    const decrement = pipeline[0].$set.totalHits.$max[1].$subtract[1];
    current.totalHits = Math.max(0, current.totalHits - decrement);
  }

  async deleteOne(filter) {
    this.records.delete(filter._id);
  }
}

test("Mongo rate-limit stores share counters across instances and isolate limiter prefixes", async () => {
  let now = 1_800_000_000_000;
  const collection = new FakeMongoCollection();
  const makeStore = (prefix) => new MongoRateLimitStore({ prefix, collection, now: () => now });
  const firstInstance = makeStore("location-lookups");
  const secondInstance = makeStore("location-lookups");
  const otherLimiter = makeStore("provider-search");
  [firstInstance, secondInstance, otherLimiter].forEach((store) => store.init({ windowMs: 60_000 }));

  assert.equal((await firstInstance.increment("203.0.113.4")).totalHits, 1);
  assert.equal((await secondInstance.increment("203.0.113.4")).totalHits, 2);
  assert.equal((await otherLimiter.increment("203.0.113.4")).totalHits, 1);
  assert.equal((await firstInstance.get("203.0.113.4")).totalHits, 2);

  await secondInstance.decrement("203.0.113.4");
  assert.equal((await firstInstance.get("203.0.113.4")).totalHits, 1);

  now += 60_001;
  assert.equal((await secondInstance.increment("203.0.113.4")).totalHits, 1);

  const storedIds = [...collection.records.keys()];
  assert.ok(storedIds.every((id) => /^[a-f\d]{64}$/i.test(id)));
  assert.ok(storedIds.every((id) => !id.includes("203.0.113.4")));

  await firstInstance.resetKey("203.0.113.4");
  assert.equal(await firstInstance.get("203.0.113.4"), undefined);
});