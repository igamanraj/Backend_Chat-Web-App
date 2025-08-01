const { PutObjectCommand } = require("@aws-sdk/client-s3");
const io = require("socket.io");
const s3 = require("../config/awsConfig");
const multer = require("multer");
const multerS3 = require("multer-s3");
const AWS = require("aws-sdk");

// Store connected users and their states
const connectedUsers = new Map();
// Store users waiting for partners
const waitingUsers = new Set();

// Function to find a random partner
const findRandomPartner = (currentUserId) => {
  const availableUsers = Array.from(waitingUsers).filter(id => id !== currentUserId);
  if (availableUsers.length === 0) return null;
  
  // Get random user from available users
  const randomIndex = Math.floor(Math.random() * availableUsers.length);
  return availableUsers[randomIndex];
};

// Function to connect two users
const connectUsers = (socketServer, user1Id, user2Id) => {
  const user1 = connectedUsers.get(user1Id);
  const user2 = connectedUsers.get(user2Id);

  if (!user1 || !user2) return false;

  // Update both users' partner references
  user1.partner = user2Id;
  user2.partner = user1Id;

  // Remove both from waiting list
  waitingUsers.delete(user1Id);
  waitingUsers.delete(user2Id);

  // Notify both users
  socketServer.to(user1Id).emit('partnerFound');
  socketServer.to(user2Id).emit('partnerFound');

  console.log(`🤝 Partners connected: ${user1Id} <-> ${user2Id}`);
  return true;
};

// Function to disconnect partners
const disconnectPartners = (socketServer, userId) => {
  const user = connectedUsers.get(userId);
  if (!user || !user.partner) return;

  const partnerId = user.partner;
  const partner = connectedUsers.get(partnerId);

  if (partner) {
    partner.partner = null;
    socketServer.to(partnerId).emit('partnerDisconnected');
  }

  user.partner = null;
};

module.exports = (server) => {
  const socketServer = io(server, {
    maxHttpBufferSize: 2e7,
    cors: {
      origin: [
        'http://localhost:5173',
        'https://chatapp-io.vercel.app',
        'https://chatapp-io.vercel.app/',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Range', 'X-Content-Range']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  socketServer.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Initialize user in the connected users map
    connectedUsers.set(socket.id, {
      id: socket.id,
      partner: null,
      lastActive: Date.now()
    });

    // Add user to waiting list
    waitingUsers.add(socket.id);

    // Try to find a partner immediately
    const partner = findRandomPartner(socket.id);
    if (partner) {
      connectUsers(socketServer, socket.id, partner);
    }

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`❌ User disconnected: ${socket.id}, Reason: ${reason}`);
      
      const user = connectedUsers.get(socket.id);
      if (user && user.partner) {
        disconnectPartners(socketServer, socket.id);
      }
      
      waitingUsers.delete(socket.id);
      connectedUsers.delete(socket.id);
      
      console.log(`👥 Total users connected: ${connectedUsers.size}`);
    });

    // Handle skip partner request
    socket.on('disconnectFromPartner', () => {
      disconnectPartners(socketServer, socket.id);
    });

    // Handle find new partner request
    socket.on('findNewPartner', () => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      // Add user to waiting list
      waitingUsers.add(socket.id);

      // Try to find a new partner
      const newPartner = findRandomPartner(socket.id);
      if (newPartner) {
        connectUsers(socketServer, socket.id, newPartner);
      }
    });

    // Message handling
    socket.on('message', ({ text, gif, messageId }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.partner) return;

      const messageData = {
        text,
        gif,
        messageId,
        senderId: socket.id
      };

      socketServer.to(user.partner).emit('message', messageData);
    });

    // Typing indicator
    socket.on('typing', (isTyping) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.partner) return;

      socketServer.to(user.partner).emit('partnerTyping', isTyping);
    });

    // Message reactions
    socket.on("messageReaction", ({ messageId, emoji, userId, action }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.partner) return;

      const reactionData = { messageId, emoji, userId, action };
      socketServer.to(user.partner).emit("messageReaction", reactionData);
      socket.emit("messageReaction", reactionData);
    });

    // Image handling
    socket.on("sendImage", async (imageData, callback) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.partner) return callback(false);

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
        socketServer.to(user.partner).emit("receiveImage", imageUrl);
        callback(imageUrl);
      } catch (err) {
        console.error("Error uploading to S3:", err);
        callback(false);
      }
    });

    // Voice message handling
    socket.on("sendVoiceMessage", async (audioData, callback) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.partner) return callback({ success: false, error: "No partner connected" });
    
      try {
        const buffer = Buffer.from(audioData.split(",")[1], "base64");
        const messageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const fileName = `voice-messages/${messageId}.webm`;
        
        const params = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: fileName,
          Body: buffer,
          ContentType: "audio/webm",
          ACL: "public-read",
        };
      
        const command = new PutObjectCommand(params);
        await s3.send(command);
    
        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        
        const messageData = {
          type: "audio",
          url: audioUrl,
          messageId,
          senderId: socket.id,
          timestamp: new Date().toISOString()
        };
    
        socketServer.to(user.partner).emit("receiveVoiceMessage", messageData);
        callback({ success: true, messageData });
      } catch (err) {
        console.error("Error uploading voice message:", err);
        callback({ 
          success: false, 
          error: "Failed to upload voice message",
          details: err.message 
        });
      }
    });
  });

  return socketServer;
};