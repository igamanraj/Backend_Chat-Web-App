require("dotenv").config();
const express = require("express");
const http = require("http");
const socketController = require("./controllers/socketController");
const corsMiddleware = require("./middleware/corsMiddleware");
const router = require("./routes/index");

const app = express();
const server = http.createServer(app);

app.use(corsMiddleware);
app.use("/", router);

// Initialize Socket.IO
socketController(server);

server.listen(9000, () => {
  console.log("🌐 Backend server is running on http://localhost:9000");
});
