const cors = require("cors");

const allowedOrigins = [
  'http://localhost:5173',
  'https://chat-app-tan-zeta.vercel.app'
];

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true,
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);
