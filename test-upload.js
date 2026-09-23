const fs = require("fs");
const http = require("http");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
fs.writeFileSync("test-front.png", png);
fs.writeFileSync("test-back.png", png);

const boundary = "testboundary123";
const body = Buffer.concat([
  Buffer.from("--" + boundary + "\r\n"),
  Buffer.from('Content-Disposition: form-data; name="idFront"; filename="test-front.png"\r\n'),
  Buffer.from("Content-Type: image/png\r\n\r\n"),
  png,
  Buffer.from("\r\n--" + boundary + "\r\n"),
  Buffer.from('Content-Disposition: form-data; name="idBack"; filename="test-back.png"\r\n'),
  Buffer.from("Content-Type: image/png\r\n\r\n"),
  png,
  Buffer.from("\r\n--" + boundary + "--\r\n"),
]);

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/verify",
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=" + boundary,
      "Content-Length": body.length,
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log("Status:", res.statusCode);
      console.log("Body:", data);
      fs.unlinkSync("test-front.png");
      fs.unlinkSync("test-back.png");
    });
  }
);
req.on("error", (e) => {
  console.log("ERR:", e.message);
  fs.unlinkSync("test-front.png");
  fs.unlinkSync("test-back.png");
});
req.write(body);
req.end();
