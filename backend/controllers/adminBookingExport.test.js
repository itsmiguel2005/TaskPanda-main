const assert = require("node:assert/strict");
const test = require("node:test");
const ExcelJS = require("exceljs");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { handleExportAdminBookings } = require("./adminBookingController");

const originalBookingFind = Booking.find;
const originalUserFind = User.find;

function createQuery(value) {
  return {
    sort() {
      return this;
    },
    populate() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => value,
  };
}

function createResponse() {
  return {
    headers: {},
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("admin booking export creates an XLSX workbook with matching status and search filters", async () => {
  const bookingId = "507f1f77bcf86cd799439011";
  let bookingFilter;
  let userFilter;
  Booking.find = (filter) => {
    bookingFilter = filter;
    return createQuery([{
      _id: bookingId,
      repairDescription: "Repair the kitchen sink",
      status: "refunded",
      clientId: { _id: "507f1f77bcf86cd799439012", fullName: "Client Example", email: "client@example.com", role: "client" },
      providerId: { _id: "507f1f77bcf86cd799439013", fullName: "Provider Example", email: "provider@example.com", role: "provider" },
      serviceDate: new Date("2026-10-01T09:00:00Z"),
      createdAt: new Date("2026-09-20T09:00:00Z"),
      offeredPrice: 1200,
      travelFee: 100,
      tipAmount: 50,
      refundAmount: 1200,
      refundStatus: "refunded",
    }]);
  };
  User.find = (filter) => {
    userFilter = filter;
    return createQuery([]);
  };

  try {
    const response = createResponse();
    await handleExportAdminBookings({ query: { q: "Client Example", status: "refunded" } }, response);

    assert.equal(response.statusCode, undefined);
    assert.equal(
      response.headers["Content-Type"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    assert.match(response.headers["Content-Disposition"], /\.xlsx/);
    assert.ok(Buffer.isBuffer(response.body));
    assert.ok(bookingFilter.$and.some((clause) => clause.status?.$in.includes("refunded")));
    assert.ok(userFilter.$or.some((clause) => clause.fullName instanceof RegExp));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const worksheet = workbook.getWorksheet("Bookings");
    assert.equal(worksheet.getRow(1).getCell(1).value, "Booking ID");
    assert.equal(worksheet.getRow(2).getCell(1).value, bookingId);
    assert.equal(worksheet.getRow(2).getCell(2).value, "Repair the kitchen sink");
    assert.equal(worksheet.getRow(2).getCell(3).value, "Refunded");
    assert.equal(worksheet.getRow(2).getCell(4).value, "Client Example");
    assert.equal(worksheet.getRow(2).getCell(16).value, 1350);
  } finally {
    Booking.find = originalBookingFind;
    User.find = originalUserFind;
  }
});

test.after(() => {
  Booking.find = originalBookingFind;
  User.find = originalUserFind;
});
