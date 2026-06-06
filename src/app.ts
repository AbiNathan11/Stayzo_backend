import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import propertyRoutes from './routes/property.routes';
import availabilityRoutes from './routes/availability.routes';
import bookingRoutes from './routes/booking.routes';
import notificationRoutes from './routes/notification.routes';
import chatRoutes from './routes/chat.routes';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startCronJobs } from './services/cron.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Expose io to controllers via app settings
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User joins their personal room for targeted notifications
  socket.on('join_user_room', (userId: string) => {
    socket.join(`user_${userId}`);
    console.log(`Socket ${socket.id} joined user room: user_${userId}`);
  });

  // Join a specific draft room (existing)
  socket.on('join_draft', (draftId) => {
    socket.join(draftId);
    console.log(`Socket ${socket.id} joined room ${draftId}`);
  });

  // Broadcast signature to desktop (existing)
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
app.use('/api/properties', propertyRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.send('Stayzo Backend Running with Socket.io');
});

startCronJobs();

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on port ${port} and listening on all network interfaces`);
});
