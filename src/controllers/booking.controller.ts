import { Response } from 'express';
import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendOTPEmail } from '../services/email.service';
import fs from 'fs';

// Helper to log debug info to a file since we cannot view the terminal output directly
function logDebug(message: string) {
  console.log(message);
}

// Helper to create a notification + emit socket event
async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string,
  bookingId?: string,
  io?: any
) {
  try {
    await prisma.notification.create({
      data: { userId, title, message, type, bookingId }
    });
    if (io) {
      io.emit('notification', { userId });
    }
  } catch (err) {
    console.warn('Failed to create notification:', err);
  }
}

// POST /api/bookings — tenant creates a booking request
export const createBooking = async (req: AuthenticatedRequest, res: Response) => {
  logDebug(`createBooking: start. tenantId=${(req.user as any)?.id} body=${JSON.stringify(req.body)}`);
  try {
    const tenantId = (req.user as any)?.id;
    if (!tenantId) {
      logDebug(`createBooking: tenantId missing`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { slotId, note } = req.body;
    if (!slotId) {
      logDebug(`createBooking: slotId missing`);
      return res.status(400).json({ error: 'slotId is required' });
    }

    let result;
    try {
      logDebug(`createBooking: entering transaction with slotId=${slotId}`);
      result = await prisma.$transaction(async (tx) => {
        // Get slot with owner's settings
        const slot = await tx.availabilitySlot.findUnique({
          where: { id: slotId },
          include: {
            property: { select: { title: true, ownerId: true } },
            bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } }
          }
        });

        if (!slot) throw new Error('Slot not found');
        if (slot.isBlocked) throw new Error('This slot is blocked');

        // Prevent booking slots in the past
        const now = new Date();
        const [h, m] = slot.startTime.split(':').map(Number);
        const slotDateTime = new Date(
          slot.date.getUTCFullYear(),
          slot.date.getUTCMonth(),
          slot.date.getUTCDate(),
          h, m, 0
        );
        if (slotDateTime < now) {
          throw new Error('Cannot book a slot in the past');
        }

        // Check max bookings not exceeded
        if (slot.bookings.length >= slot.maxBookings) {
          throw new Error('This slot is fully booked');
        }

        // Prevent double booking by same tenant
        const existing = await tx.booking.findFirst({
          where: { slotId, tenantId, status: { in: ['PENDING', 'CONFIRMED'] } }
        });
        if (existing) throw new Error('You already have a booking for this slot');

        // Get owner's auto-approve preference
        const owner = await tx.user.findUnique({
          where: { id: slot.property.ownerId },
          select: { autoApprove: true }
        });

        const initialStatus: BookingStatus = owner?.autoApprove ? 'CONFIRMED' : 'PENDING';

        const booking = await tx.booking.create({
          data: {
            slotId,
            tenantId,
            propertyId: slot.propertyId,
            status: initialStatus,
            note: note || null,
          },
          include: {
            slot: true,
            property: { select: { title: true } },
            tenant: { select: { firstName: true, lastName: true, email: true } }
          }
        });

        return { booking, slot, initialStatus };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000
      });
    } catch (err: any) {
      if (err.message === 'Slot not found') return res.status(404).json({ error: err.message });
      if (['This slot is fully booked', 'You already have a booking for this slot'].includes(err.message)) {
        return res.status(409).json({ error: err.message });
      }
      if (['This slot is blocked', 'Cannot book a slot in the past'].includes(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const { booking, slot, initialStatus } = result;
    const io = (req.app as any).get('io');

    // Notify owner
    const tenantName = `${booking.tenant.firstName || ''} ${booking.tenant.lastName || ''}`.trim();
    await createNotification(
      slot.property.ownerId,
      'New Booking Request',
      `${tenantName} requested a visit for ${booking.property.title} on ${slot.date.toDateString()} at ${slot.startTime}`,
      'booking_request',
      booking.id,
      io
    );

    // If auto-approved, notify tenant
    if (initialStatus === 'CONFIRMED') {
      await createNotification(
        tenantId,
        'Booking Confirmed!',
        `Your visit for ${booking.property.title} on ${slot.date.toDateString()} at ${slot.startTime} is confirmed.`,
        'booking_confirmed',
        booking.id,
        io
      );

      // Check if scheduled date is today to remind them
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const slotDate = new Date(slot.date);
      if (slotDate >= todayStart && slotDate <= todayEnd) {
        await createNotification(
          tenantId,
          'Visit Scheduled Today',
          `Reminder: You have a scheduled visit for ${booking.property.title} today at ${slot.startTime}.`,
          'booking_reminder',
          booking.id,
          io
        );
        await createNotification(
          slot.property.ownerId,
          'Visit Scheduled Today',
          `Reminder: Tenant ${tenantName} is scheduled to visit ${booking.property.title} today at ${slot.startTime}.`,
          'booking_reminder',
          booking.id,
          io
        );
      }
    }

    // Emit socket event (attached to req.app)
    if (io) {
      io.emit('new_booking_request', {
        ownerId: slot.property.ownerId,
        bookingId: booking.id,
        tenantName,
        slotTime: `${slot.startTime}–${slot.endTime}`,
        propertyTitle: booking.property.title,
        status: initialStatus,
      });
    }

    res.status(201).json(booking);
  } catch (error: any) {
    logDebug(`createBooking error: ${error.message} - ${error.stack}`);
    console.error('createBooking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

// GET /api/bookings/tenant — tenant's bookings
export const getTenantBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = (req.user as any)?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const bookings = await prisma.booking.findMany({
      where: { tenantId },
      include: {
        slot: true,
        property: { select: { id: true, title: true, description: true, address: true, city: true, images: true, price: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const propertyBookings = await prisma.propertyBooking.findMany({
      where: { tenantId },
      include: {
        property: { select: { id: true, title: true, description: true, address: true, city: true, images: true, price: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mappedPropertyBookings = propertyBookings.map(pb => ({
      id: pb.id,
      status: pb.status,
      createdAt: pb.createdAt,
      property: pb.property,
      slot: null
    }));

    res.status(200).json([...bookings, ...mappedPropertyBookings]);
  } catch (error) {
    console.error('getTenantBookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// GET /api/bookings/owner — owner's incoming bookings
export const getOwnerBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const bookings = await prisma.booking.findMany({
      where: { property: { ownerId } },
      include: {
        slot: true,
        property: { select: { title: true, address: true, price: true } },
        tenant: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch simple "Book Now" requests from PropertyBooking table
    const propertyBookings = await prisma.propertyBooking.findMany({
      where: {
        property: { ownerId },
        status: 'PENDING'
      },
      include: {
        property: { select: { title: true, address: true, price: true } },
        tenant: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const simpleRequests = propertyBookings.map(pb => ({
      id: pb.id,
      status: pb.status,
      createdAt: pb.createdAt,
      property: pb.property,
      tenant: pb.tenant,
      slot: null
    }));

    res.status(200).json([...bookings, ...simpleRequests]);
  } catch (error) {
    console.error('getOwnerBookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// PATCH /api/bookings/:id/approve — owner approves
export const approveBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    const { id } = req.params;

    const propertyBooking = await prisma.propertyBooking.findUnique({
      where: { id },
      include: { property: true }
    });

    if (propertyBooking) {
      if (propertyBooking.property.ownerId !== ownerId) return res.status(403).json({ error: 'Forbidden' });
      
      const updated = await prisma.propertyBooking.update({
        where: { id },
        data: { status: 'CONFIRMED' }
      });

      await prisma.property.update({
        where: { id: propertyBooking.propertyId },
        data: { bookingStatus: 'Booked' }
      });

      const io = (req.app as any).get('io');
      await createNotification(
        propertyBooking.tenantId,
        'Booking Request Accepted',
        `Your request to book ${propertyBooking.property.title} has been accepted by the owner.`,
        'booking_confirmed',
        undefined,
        io
      );

      await prisma.notification.deleteMany({
        where: {
          userId: ownerId,
          type: 'BOOKING_REQUEST',
          bookingId: id
        }
      });

      return res.status(200).json({ success: true, message: 'Booking approved' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        slot: true,
        property: { select: { title: true, ownerId: true } },
        tenant: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.property.ownerId !== ownerId) return res.status(403).json({ error: 'Forbidden' });
    if (booking.status !== 'PENDING') return res.status(400).json({ error: 'Booking is not pending' });

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' }
    });

    const io = (req.app as any).get('io');

    await createNotification(
      booking.tenantId,
      'Booking Confirmed!',
      `Your visit for ${booking.property.title} on ${booking.slot.date.toDateString()} at ${booking.slot.startTime} is confirmed.`,
      'booking_confirmed',
      id,
      io
    );

    // Check if scheduled date is today to remind them
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const slotDate = new Date(booking.slot.date);
    if (slotDate >= todayStart && slotDate <= todayEnd) {
      const tenantName = `${booking.tenant.firstName || ''} ${booking.tenant.lastName || ''}`.trim();
      await createNotification(
        booking.tenantId,
        'Visit Scheduled Today',
        `Reminder: You have a scheduled visit for ${booking.property.title} today at ${booking.slot.startTime}.`,
        'booking_reminder',
        id,
        io
      );
      await createNotification(
        booking.property.ownerId,
        'Visit Scheduled Today',
        `Reminder: Tenant ${tenantName} is scheduled to visit ${booking.property.title} today at ${booking.slot.startTime}.`,
        'booking_reminder',
        id,
        io
      );
    }

    if (io) {
      io.emit('booking_update', { bookingId: id, tenantId: booking.tenantId, status: 'CONFIRMED' });
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('approveBooking error:', error);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
};

// PATCH /api/bookings/:id/reject — owner rejects
export const rejectBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    const { id } = req.params;

    const propertyBooking = await prisma.propertyBooking.findUnique({
      where: { id },
      include: { property: true }
    });

    if (propertyBooking) {
      if (propertyBooking.property.ownerId !== ownerId) return res.status(403).json({ error: 'Forbidden' });
      
      const updated = await prisma.propertyBooking.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      await prisma.property.update({
        where: { id: propertyBooking.propertyId },
        data: { bookingStatus: 'default' }
      });

      const io = (req.app as any).get('io');
      await createNotification(
        propertyBooking.tenantId,
        'Booking Request Declined',
        `Your request to book ${propertyBooking.property.title} has been declined.`,
        'booking_cancelled',
        undefined,
        io
      );

      await prisma.notification.deleteMany({
        where: {
          userId: ownerId,
          type: 'BOOKING_REQUEST',
          bookingId: id
        }
      });

      return res.status(200).json({ success: true, message: 'Booking declined' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        slot: true,
        property: { select: { title: true, ownerId: true } },
        tenant: { select: { firstName: true, email: true } }
      }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.property.ownerId !== ownerId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    const io = (req.app as any).get('io');

    await createNotification(
      booking.tenantId,
      'Booking Not Approved',
      `Your visit request for ${booking.property.title} was not approved by the owner.`,
      'booking_cancelled',
      id,
      io
    );

    if (io) {
      io.emit('booking_update', { bookingId: id, tenantId: booking.tenantId, status: 'CANCELLED' });
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('rejectBooking error:', error);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
};

// PATCH /api/bookings/:id/cancel — tenant or owner cancels
export const cancelBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { id } = req.params;

    let booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        slot: true,
        property: { select: { title: true, ownerId: true } },
        tenant: { select: { firstName: true, email: true } }
      }
    });

    if (booking) {
      const isTenant = booking.tenantId === userId;
      const isOwner = booking.property.ownerId === userId;
      if (!isTenant && !isOwner) return res.status(403).json({ error: 'Forbidden' });

      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      const io = (req.app as any).get('io');
      const notifyUserId = isTenant ? booking.property.ownerId : booking.tenantId;
      const cancelledBy = isTenant ? `Tenant ${booking.tenant.firstName}` : 'The owner';
      await createNotification(
        notifyUserId,
        'Booking Cancelled',
        `${cancelledBy} cancelled the visit for ${booking.property.title} on ${booking.slot.date.toDateString()} at ${booking.slot.startTime}.`,
        'booking_cancelled',
        id,
        io
      );

      if (io) {
        io.emit('booking_update', { bookingId: id, tenantId: booking.tenantId, ownerId: booking.property.ownerId, status: 'CANCELLED' });
      }

      return res.status(200).json(updated);
    }

    // Check PropertyBooking
    const propertyBooking = await prisma.propertyBooking.findUnique({
      where: { id },
      include: {
        property: { select: { title: true, ownerId: true } },
        tenant: { select: { firstName: true, email: true } }
      }
    });

    if (!propertyBooking) return res.status(404).json({ error: 'Booking not found' });

    const isTenant = propertyBooking.tenantId === userId;
    const isOwner = propertyBooking.property.ownerId === userId;
    if (!isTenant && !isOwner) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.propertyBooking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    await prisma.property.update({
      where: { id: propertyBooking.propertyId },
      data: { bookingStatus: 'available' }
    });

    const io = (req.app as any).get('io');
    const notifyUserId = isTenant ? propertyBooking.property.ownerId : propertyBooking.tenantId;
    const cancelledBy = isTenant ? `Tenant ${propertyBooking.tenant.firstName}` : 'The owner';
    await createNotification(
      notifyUserId,
      'Booking Cancelled',
      `${cancelledBy} cancelled the booking request for ${propertyBooking.property.title}.`,
      'booking_cancelled',
      id,
      io
    );

    if (io) {
      io.emit('booking_update', { bookingId: id, tenantId: propertyBooking.tenantId, ownerId: propertyBooking.property.ownerId, status: 'CANCELLED' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    console.error('cancelBooking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// PATCH /api/bookings/:id/reschedule — move booking to a new slot
export const rescheduleBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { id } = req.params;
    const { newSlotId } = req.body;

    if (!newSlotId) return res.status(400).json({ error: 'newSlotId is required' });

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { title: true, ownerId: true } }, slot: true }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isTenant = booking.tenantId === userId;
    const isOwner = booking.property.ownerId === userId;
    if (!isTenant && !isOwner) return res.status(403).json({ error: 'Forbidden' });
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return res.status(400).json({ error: 'Only pending or confirmed bookings can be rescheduled' });
    }

    const newSlot = await prisma.availabilitySlot.findUnique({
      where: { id: newSlotId },
      include: { bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } }
    });
    if (!newSlot) return res.status(404).json({ error: 'New slot not found' });
    if (newSlot.isBlocked) return res.status(400).json({ error: 'New slot is blocked' });
    if (newSlot.bookings.length >= newSlot.maxBookings) {
      return res.status(409).json({ error: 'New slot is fully booked' });
    }

    // If owner reschedules, it's auto-confirmed. If tenant, check owner's autoApprove pref.
    const ownerPref = await prisma.user.findUnique({
      where: { id: booking.property.ownerId },
      select: { autoApprove: true }
    });
    const newStatus = isOwner ? 'CONFIRMED' : (ownerPref?.autoApprove ? 'CONFIRMED' : 'PENDING');

    const updated = await prisma.booking.update({
      where: { id },
      data: { slotId: newSlotId, status: newStatus }
    });

    const io = (req.app as any).get('io');

    // Notify owner of reschedule
    await createNotification(
      booking.property.ownerId,
      'Booking Rescheduled',
      `A booking for ${booking.property.title} was rescheduled to ${newSlot.date.toDateString()} at ${newSlot.startTime}.`,
      'booking_request',
      id,
      io
    );

    // If it becomes confirmed and the date is today, create today's reminders
    if (newStatus === 'CONFIRMED') {
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

      const slotDate = new Date(newSlot.date);
      if (slotDate >= todayStart && slotDate <= todayEnd) {
        // Fetch tenant details to get the name
        const tenant = await prisma.user.findUnique({
          where: { id: booking.tenantId },
          select: { firstName: true, lastName: true }
        });
        const tenantName = `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim();
        
        await createNotification(
          booking.tenantId,
          'Visit Scheduled Today',
          `Reminder: You have a scheduled visit for ${booking.property.title} today at ${newSlot.startTime}.`,
          'booking_reminder',
          id,
          io
        );
        await createNotification(
          booking.property.ownerId,
          'Visit Scheduled Today',
          `Reminder: Tenant ${tenantName} is scheduled to visit ${booking.property.title} today at ${newSlot.startTime}.`,
          'booking_reminder',
          id,
          io
        );
      }
    }

    if (io) {
      io.emit('booking_update', { bookingId: id, tenantId: booking.tenantId, ownerId: booking.property.ownerId, status: newStatus });
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('rescheduleBooking error:', error);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
};
