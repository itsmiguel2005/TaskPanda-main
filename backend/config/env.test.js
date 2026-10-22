const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const envModulePath = path.join(__dirname, "env.js");

function getMongoMaxPoolSize(environment = {}) {
  const childEnvironment = {
    ...process.env,
    MONGO_URI: "",
    MONGO_DB_NAME: "taskpanda-test",
    ...environment,
  };
  if (!Object.hasOwn(environment, "VERCEL")) delete childEnvironment.VERCEL;
  return Number(execFileSync(process.execPath, [
    "-e",
    `process.stdout.write(String(require(${JSON.stringify(envModulePath)}).mongoMaxPoolSize))`,
  ], { env: childEnvironment, encoding: "utf8" }));
}

test("Vercel MongoDB pools default to two connections", () => {
  assert.equal(getMongoMaxPoolSize({ VERCEL: "1", MONGO_MAX_POOL_SIZE: "" }), 2);
});

test("Vercel MongoDB pool size cannot exceed two", () => {
  assert.equal(getMongoMaxPoolSize({ VERCEL: "1", MONGO_MAX_POOL_SIZE: "10" }), 2);
});

test("Vercel permits a lower configured MongoDB pool size", () => {
  assert.equal(getMongoMaxPoolSize({ VERCEL: "1", MONGO_MAX_POOL_SIZE: "1" }), 1);
});

test("non-Vercel MongoDB pool configuration keeps the existing ten-connection ceiling", () => {
  assert.equal(getMongoMaxPoolSize({ MONGO_MAX_POOL_SIZE: "10" }), 10);
  assert.equal(getMongoMaxPoolSize({ MONGO_MAX_POOL_SIZE: "20" }), 10);
});
