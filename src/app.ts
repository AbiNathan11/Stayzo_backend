import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow cross-origin requests for mobile testing
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a specific draft room
  socket.on('join_draft', (draftId) => {
    socket.join(draftId);
    console.log(`Socket ${socket.id} joined room ${draftId}`);
  });

  // Broadcast signature to desktop
  socket.on('signature_drawn', (data) => {
    const { draftId, role, signatureDataUrl } = data;
    socket.to(draftId).emit('signature_received', { role, signatureDataUrl });
    console.log(`Signature (${role}) broadcasted to room ${draftId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Stayzo Backend Running with Socket.io');
});

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on port ${port} and listening on all network interfaces`);
});
