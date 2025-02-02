require("dotenv").config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require("fs");


// 🔹 Import AWS SDK v3 Clients
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // Allow frontend to connect
    methods: ['GET', 'POST'],
  },
});

// 🔹 Configure AWS S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


// 🔹 Multer Setup for File Uploads
const upload = multer({ dest: "uploads/" });

// Maintain a list of connected users
const connectedUsers = [];

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  connectedUsers.push(socket.id);

  // Assign the user a random partner
  let partner = null;

  const findPartner = () => {
    for (const user of connectedUsers) {
      if (user !== socket.id && !io.sockets.sockets.get(user)?.partner) {
        return user;
      }
    }
    return null;
  };

  partner = findPartner();
  if (partner) {
    socket.partner = partner;
    io.sockets.sockets.get(partner).partner = socket.id;
    console.log(`Paired: ${socket.id} <--> ${partner}`);

    // Check if users are re-paired with the same partner
    if (socket.previousPartner === partner) {
      io.to(socket.id).emit('rejoined');
      io.to(partner).emit('rejoined');
    } else {
      io.to(socket.id).emit('partnerFound');
      io.to(partner).emit('partnerFound');
    }

    // Store the previous partner for future checks
    socket.previousPartner = partner;
    io.sockets.sockets.get(partner).previousPartner = socket.id;
  }

  // Handle message sending between paired users
  socket.on('message', (message) => {
    if (socket.partner) {
      io.to(socket.partner).emit('message', message);
    }
  });

  // Handle 'disconnectFromPartner' event
  socket.on('disconnectFromPartner', () => {
    console.log(`Disconnecting from partner: ${socket.id}`);
    if (socket.partner) {
      const partnerSocket = io.sockets.sockets.get(socket.partner);
      if (partnerSocket) {
        // Notify both users to clear chat history
        io.to(socket.id).emit('clearChat');
        io.to(socket.partner).emit('clearChat');

        // Notify the partner that the user has disconnected
        io.to(socket.partner).emit('partnerDisconnected');
        partnerSocket.partner = null;
      }
      socket.partner = null;
    }
  });

  // Handle image uploads to AWS S3
  socket.on("sendImage", async (imageData, callback) => {
    if (!socket.partner) {
      console.log("No partner found to send the image.");
      return callback(false);
    }

    const buffer = Buffer.from(imageData.split(",")[1], "base64");
    const fileName = `chat-images/${Date.now()}.jpg`;

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: "image/jpeg",
      ACL: "public-read",
    };

    try {
      const command = new PutObjectCommand(params);
      await s3.send(command);

      const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      console.log(`Image uploaded to S3: ${imageUrl}`);

      io.to(socket.partner).emit("receiveImage", imageUrl);
      callback(imageUrl);
    } catch (err) {
      console.error("Error uploading to S3:", err);
      callback(false);
    }
  });

  // Handle skip action
  socket.on('skip', () => {
    if (socket.partner) {
      // Notify both users to clear chat history
      io.to(socket.id).emit('clearChat');
      io.to(socket.partner).emit('clearChat');

      // Notify the partner that the user has skipped
      io.to(socket.partner).emit('partnerDisconnected');

      // Clear partner reference
      const partnerSocket = io.sockets.sockets.get(socket.partner);
      if (partnerSocket) partnerSocket.partner = null;
      socket.partner = null;
    }
  });

  // Handle 'findNewPartner' event
  socket.on('findNewPartner', () => {
    console.log(`Finding new partner for: ${socket.id}`);
    const newPartner = findPartner();
    if (newPartner) {
      socket.partner = newPartner;
      io.sockets.sockets.get(newPartner).partner = socket.id;
      console.log(`Re-paired: ${socket.id} <--> ${newPartner}`);
      io.to(socket.id).emit('partnerFound');
      io.to(newPartner).emit('partnerFound');
    } else {
      io.to(socket.id).emit('partnerDisconnected'); // Notify if no new partner is available
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const index = connectedUsers.indexOf(socket.id);
    if (index !== -1) connectedUsers.splice(index, 1);

    // Notify the partner if there is one
    if (socket.partner) {
      io.to(socket.partner).emit('clearChat');
      io.to(socket.partner).emit('partnerDisconnected');
      const partnerSocket = io.sockets.sockets.get(socket.partner);
      if (partnerSocket) partnerSocket.partner = null;
    }
  });
});

server.listen(9000, () => {
  console.log('Backend server is running on http://localhost:9000');
});
