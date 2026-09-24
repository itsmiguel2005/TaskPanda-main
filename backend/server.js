const app = require("./app");
const connectDB = require("./db");
const { port } = require("./config/env");

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(port, () => console.log(`TaskPanda server running at http://localhost:${port}`));
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = app;