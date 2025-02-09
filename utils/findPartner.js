module.exports = function findPartner(socketId, connectedUsers, io) {
    for (const user of connectedUsers) {
      if (user !== socketId && !io.sockets.sockets.get(user)?.partner) {
        return user;
      }
    }
    return null;
  };
  