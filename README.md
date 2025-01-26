# Chat Web App Backend
This is the backend for the Chat Web App, built using **Node.js** and **Socket.IO**. The backend facilitates real-time communication between users, managing connections and messaging.

## Features
- Real-time one-on-one chat functionality.
- Handles user connections and disconnections.
- Facilitates events like joining a room, sending messages, and leaving a room.
- Lightweight and fast using Socket.IO for WebSocket communication.

## Technologies Used
- **Frontend**: React (with Vite)
- **Styling**: Tailwind CSS
- **Web Socket Package**: `Socket.io` [NPM Package](https://www.npmjs.com/package/socket.io)


## Prerequisites
Before you begin, ensure you have the following installed:
- **Node.js** (v16 or higher)
- **npm** (Node Package Manager)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/Backend_Chat-Web-App.git
2. Navigate to the project directory:
   ```bash
   cd Backend_Chat-Web-App
3. Install dependencies:
   ```bash
   npm install
4. Start the server:
    ```bash
    node index.js
## Environment Variables
Create a **.env** file in the root directory and configure the following environment variables:

```
PORT=9000
FRONTEND_URL=http://localhost:5173
```
## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.