const { PutObjectCommand } = require("@aws-sdk/client-s3");
const io = require("socket.io");
const s3 = require("../config/awsConfig");
const findPartner = require("../utils/findPartner");

// Change from array to Map
const connectedUsers = new Map();

module.exports = (server) => {
  const socketServer = io(server, {
    maxHttpBufferSize: 2e7, // 20MB size limit
    cors: {
      origin: ['http://localhost:5173', 'https://chat-app-tan-zeta.vercel.app'],
      methods: ['GET', 'POST'],
      credentials: true
    },
  });

  socketServer.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Store socket in the Map with additional info
    connectedUsers.set(socket.id, {
      id: socket.id,
      partner: null,
      lastActive: Date.now()
    });

    // Assign random partner using your existing function
    // We'll need to update the partner references too
    let partner = findPartner(socket.id, Array.from(connectedUsers.keys()), socketServer);

    if (partner) {
      // Update both users' partner reference
      const userInfo = connectedUsers.get(socket.id);
      const partnerInfo = connectedUsers.get(partner);

      if (userInfo && partnerInfo) {
        userInfo.partner = partner;
        partnerInfo.partner = socket.id;

        // Keep the socket.partner for backward compatibility
        socket.partner = partner;
        socketServer.sockets.sockets.get(partner).partner = socket.id;

        // Notify both users
        socketServer.to(socket.id).emit('partnerFound');
        socketServer.to(partner).emit('partnerFound');
      }
    }

    // Message event - no changes needed
    socket.on('message', ({ text, gif, messageId }) => {
      if (socket.partner) {
        const messageData = {
          text,
          gif,
          messageId,
          senderId: socket.id
        };

        // Send message to receiver
        socketServer.to(socket.partner).emit('message', messageData);
      }
    });

    // Image Upload to S3 - no changes needed
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

    // Typing event - fix to use the Map correctly
    socket.on('typing', (isTyping) => {
      // Get user from Map
      const userInfo = connectedUsers.get(socket.id);
      if (!userInfo || !userInfo.partner) return;

      socketServer.to(userInfo.partner).emit('partnerTyping', isTyping);
    });

    // Reaction event - no changes needed
    socket.on("messageReaction", ({ messageId, emoji, userId, action }) => {
      if (socket.partner) {
        socketServer.to(socket.partner).emit("messageReaction", {
          messageId,
          emoji,
          userId,
          action
        });

        socket.emit("messageReaction", {
          messageId,
          emoji,
          userId,
          action
        });
      }
    });

    socket.on("sendVoice", async(audioBlob, callback) => {
      if (!socket.partner) return callback(false);
    
      const fileName = `voice-messages/${Date.now()}.webm`;
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: Buffer.from(audioBlob, "base64"),
        ContentType: "audio/webm",
        ACL: "public-read",
      };
    
      try {
        const command = new PutObjectCommand(params);
        await s3.send(command);
    
        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        socketServer.to(socket.partner).emit("receiveVoice", audioUrl);
        callback(audioUrl);
      } catch (err) {
        console.error("Error uploading voice message:", err);
        callback(false);
      }
    });
    

    // Disconnect handling - fix to use the Map correctly
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);

      // Get user info before removing
      const userInfo = connectedUsers.get(socket.id);

      // Remove from Map
      connectedUsers.delete(socket.id);

      // Notify partner
      if (userInfo && userInfo.partner) {
        socketServer.to(userInfo.partner).emit('partnerDisconnected');

        // Also update partner's reference
        const partnerInfo = connectedUsers.get(userInfo.partner);
        if (partnerInfo) {
          partnerInfo.partner = null;
        }

        // Send typing=false to partner
        socketServer.to(userInfo.partner).emit('partnerTyping', false);
      }
    });
  });

  return socketServer;
};