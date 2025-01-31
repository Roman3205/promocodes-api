const { toNodeListener } = require("h3");
const { app } = require("./app.js");
const { createServer } = require("node:http");
const dotenv = require("dotenv");
dotenv.config({ path: __dirname + "/.env" });

createServer(toNodeListener(app)).listen(process.env.SERVER_PORT, () =>
  console.log(`Server is running on ${process.env.SERVER_PORT} port`)
);
