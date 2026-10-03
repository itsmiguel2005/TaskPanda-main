const app = require("./app");
const connectDB = require("./db");
const { port } = require("./config/env");
const { processCashSettlementFallbacks, processExpiredBookingRequests } = require("./controllers/bookingController");

const CASH_SETTLEMENT_INTERVAL_MS = 60 * 1000;
const BOOKING_EXPIRATION_INTERVAL_MS = 10 * 1000;

if (require.main === module) {
  connectDB()
    .then(() => {
      processCashSettlementFallbacks().catch((error) => console.error("Initial cash settlement pass failed:", error));
      processExpiredBookingRequests().catch((error) => console.error("Initial booking expiry pass failed:", error));
      setInterval(() => {
        processCashSettlementFallbacks().catch((error) => console.error("Cash settlement pass failed:", error));
      }, CASH_SETTLEMENT_INTERVAL_MS);
      setInterval(() => {
        processExpiredBookingRequests().catch((error) => console.error("Booking expiry pass failed:", error));
      }, BOOKING_EXPIRATION_INTERVAL_MS);
      app.listen(port, () => console.log(`TaskPanda server running at http://localhost:${port}`));
    })
    .catch((error) => {
      console.error("TaskPanda server failed to start:", error.message);
      process.exitCode = 1;
    });
}

module.exports = app;