const app = require("./app");
const connectDB = require("./db");
const { port } = require("./config/env");
const { processCashSettlementFallbacks, processExpiredBookingRequests, processBookingNoShowCheckIns } = require("./controllers/bookingController");
const { resumePendingVerificationOCR } = require("./controllers/verificationController");

const CASH_SETTLEMENT_INTERVAL_MS = 60 * 1000;
const BOOKING_EXPIRATION_INTERVAL_MS = 10 * 1000;
const BOOKING_NO_SHOW_CHECK_IN_INTERVAL_MS = 10 * 1000;

if (require.main === module) {
  connectDB()
    .then(() => {
      processCashSettlementFallbacks().catch((error) => console.error("Initial cash settlement pass failed:", error));
      processExpiredBookingRequests().catch((error) => console.error("Initial booking expiry pass failed:", error));
      processBookingNoShowCheckIns().catch((error) => console.error("Initial PandaBot no-show check-in pass failed:", error));
      resumePendingVerificationOCR()
        .then((count) => {
          if (count) console.log(`Resumed ${count} pending identity OCR submission(s).`);
        })
        .catch((error) => console.error("Initial identity OCR recovery failed:", error));
      setInterval(() => {
        processCashSettlementFallbacks().catch((error) => console.error("Cash settlement pass failed:", error));
      }, CASH_SETTLEMENT_INTERVAL_MS);
      setInterval(() => {
        processExpiredBookingRequests().catch((error) => console.error("Booking expiry pass failed:", error));
      }, BOOKING_EXPIRATION_INTERVAL_MS);
      setInterval(() => {
        processBookingNoShowCheckIns().catch((error) => console.error("PandaBot no-show check-in pass failed:", error));
      }, BOOKING_NO_SHOW_CHECK_IN_INTERVAL_MS);
      app.listen(port, () => console.log(`TaskPanda server running at http://localhost:${port}`));
    })
    .catch((error) => {
      console.error("TaskPanda server failed to start:", error.message);
      process.exitCode = 1;
    });
}

module.exports = app;