const { PutObjectCommand } = require("@aws-sdk/client-s3");
const io = require("socket.io");
const s3 = require("../config/awsConfig");
const findPartner = require("../utils/findPartner");

const connectedUsers = [];

module.exports = (server) => {
  const socketServer = io(server, {
    maxHttpBufferSize: 2e7, // 20MB size limit
    cors: {
      origin: `${process.env.FRONTEND_URL}`,
      methods: ['GET', 'POST'],
    },

  });

  socketServer.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    connectedUsers.push(socket.id);
    
    // Assign random partner
    let partner = findPartner(socket.id, connectedUsers, socketServer);
    if (partner) {
      socket.partner = partner;
      socketServer.sockets.sockets.get(partner).partner = socket.id;
      socketServer.to(socket.id).emit('partnerFound');
      socketServer.to(partner).emit('partnerFound');
    }

    // Message event
    socket.on('message', (message) => {
      if (socket.partner) {
        socketServer.to(socket.partner).emit('message', message);
      }
    });

    // Image Upload to S3
    socket.on("sendImage", async (imageData, callback) => {
      if (!socket.partner) return callback(false);
      
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
        socketServer.to(socket.partner).emit("receiveImage", imageUrl);
        callback(imageUrl);
      } catch (err) {
        console.error("Error uploading to S3:", err);
        callback(false);
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      connectedUsers.splice(connectedUsers.indexOf(socket.id), 1);
      if (socket.partner) {
        socketServer.to(socket.partner).emit('partnerDisconnected');
      }
    });
  });

  return socketServer;
};
