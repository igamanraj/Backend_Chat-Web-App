const cors = require("cors");

const corsMiddleware = cors({
  origin: ["http://localhost:5173"],
  methods: ["GET", "POST"],
  credentials: true
});

module.exports = corsMiddleware;