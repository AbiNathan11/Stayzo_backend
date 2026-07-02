import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import fs from 'fs';

// Helper to log debug info to a file
function logDebug(message: string) {
  console.log(message);
}

// Helper: add minutes to a "HH:MM" string → return "HH:MM"
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

// POST /api/availability — create single slot(s) for a property
export const createSlot = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    logDebug(`createSlot: ownerId=${ownerId} body=${JSON.stringify(req.body)}`);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId, date, startTime, endTime, slotDuration, bufferTime, maxBookings } = req.body;
    if (!propertyId || !date || !startTime || !endTime) {
      logDebug('createSlot: Missing required fields');
      return res.status(400).json({ error: 'propertyId, date, startTime, endTime are required' });
    }

    if (endTime <= startTime) {
      logDebug(`createSlot: Invalid time range: startTime=${startTime} endTime=${endTime}`);
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Prevent creating slots in the past
    const now = new Date();
    const dateStr = date.split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    const [h, m] = startTime.split(':').map(Number);
    const slotDateTime = new Date(year, month - 1, day, h, m, 0);
    if (slotDateTime < now) {
      logDebug(`createSlot: Past time slot slotDateTime=${slotDateTime.toISOString()} now=${now.toISOString()}`);
      return res.status(400).json({ error: 'Cannot create availability in the past' });
    }

    // Verify property exists
    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    if (!property) {
      logDebug(`createSlot: Property not found: ${propertyId}`);
      return res.status(404).json({ error: 'Property not found' });
    }

    // Verify property belongs to owner, or caller is Admin
    const isAdmin = (req.user as any)?.isAdmin;
    if (property.ownerId !== ownerId && !isAdmin) {
      logDebug(`createSlot: Property not owned by user property.ownerId=${property.ownerId} ownerId=${ownerId}`);
      return res.status(403).json({ error: 'Property not found or not owned by you' });
    }

    const finalOwnerId = isAdmin ? property.ownerId : ownerId;
    const duration = slotDuration || 30;
    const buffer = bufferTime || 0;
    const slotDate = new Date(`${date.split('T')[0]}T00:00:00.000Z`);

    // Generate all target slot time windows in memory
    const candidateSlots: { startTime: string; endTime: string }[] = [];
    let currentStart = startTime;
    while (true) {
      const currentEnd = addMinutes(currentStart, duration);
      if (currentEnd > endTime) break;
      candidateSlots.push({ startTime: currentStart, endTime: currentEnd });
      
      const nextStart = addMinutes(currentStart, duration + buffer);
      // Safety check to prevent infinite loop if duration + buffer is 0
      if (nextStart <= currentStart) {
        break; 
      }
      currentStart = nextStart;
    }

    // Single query to get all existing slots on this date
    const existingSlots = await prisma.availabilitySlot.findMany({
      where: {
        propertyId,
        date: slotDate,
        isBlocked: false,
        startTime: { in: candidateSlots.map(c => c.startTime) }
      }
    });
    const existingStartTimes = new Set(existingSlots.map(s => s.startTime));

    // Filter candidate slots
    const newSlotsToCreate = candidateSlots.filter(c => !existingStartTimes.has(c.startTime));

    const createdSlots = [];
    if (newSlotsToCreate.length > 0) {
      await prisma.availabilitySlot.createMany({
        data: newSlotsToCreate.map(s => ({
          propertyId,
          ownerId: finalOwnerId,
          date: slotDate,
          startTime: s.startTime,
          endTime: s.endTime,
          slotDuration: duration,
          bufferTime: buffer,
          maxBookings: maxBookings || 1,
        }))
      });

      // Fetch the created slots to return them to the client
      const created = await prisma.availabilitySlot.findMany({
        where: {
          propertyId,
          date: slotDate,
          startTime: { in: newSlotsToCreate.map(s => s.startTime) }
        }
      });
      createdSlots.push(...created);
    }

    logDebug(`createSlot: Successfully created ${createdSlots.length} slots`);
    res.status(201).json({ message: `${createdSlots.length} slot(s) created`, slots: createdSlots });
  } catch (error) {
    logDebug(`createSlot error: ${error}`);
    console.error('createSlot error:', error);
    res.status(500).json({ error: 'Failed to create slot' });
  }
};

// POST /api/availability/recurring — expand recurring slots for next N weeks
export const createRecurringSlots = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    logDebug(`createRecurringSlots: ownerId=${ownerId} body=${JSON.stringify(req.body)}`);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId, dayOfWeek, startTime, endTime, slotDuration, bufferTime, weeksAhead } = req.body;
    if (!propertyId || dayOfWeek === undefined || !startTime || !endTime) {
      logDebug('createRecurringSlots: Missing required fields');
      return res.status(400).json({ error: 'propertyId, dayOfWeek, startTime, endTime are required' });
    }

    if (endTime <= startTime) {
      logDebug(`createRecurringSlots: Invalid time range: startTime=${startTime} endTime=${endTime}`);
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Find the next occurrence of dayOfWeek from today
    const today = new Date();
    let start = new Date(today);
    while (start.getDay() !== dayOfWeek) {
      start = addDays(start, 1);
    }

    // If the next occurrence is today, prevent creating past slots
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    if (startStr === todayStr) {
      const [h, m] = startTime.split(':').map(Number);
      const slotDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
      if (slotDateTime < today) {
        logDebug('createRecurringSlots: past start datetime');
        return res.status(400).json({ error: 'Cannot create recurring availability starting in the past' });
      }
    }

    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    if (!property) {
      logDebug(`createRecurringSlots: Property not found: ${propertyId}`);
      return res.status(404).json({ error: 'Property not found' });
    }

    const isAdmin = (req.user as any)?.isAdmin;
    if (property.ownerId !== ownerId && !isAdmin) {
      logDebug(`createRecurringSlots: Property not owned by user property.ownerId=${property.ownerId} ownerId=${ownerId}`);
      return res.status(403).json({ error: 'Property not found or not owned by you' });
    }

    const finalOwnerId = isAdmin ? property.ownerId : ownerId;
    const duration = slotDuration || 30;
    const buffer = bufferTime || 0;
    const weeks = weeksAhead || 8;

    // Generate all candidate slots in memory across N weeks
    const targetDates: Date[] = [];
    const candidateSlots: { date: Date; startTime: string; endTime: string }[] = [];

    for (let w = 0; w < weeks; w++) {
      const d = addDays(start, w * 7);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const slotDate = new Date(`${dateStr}T00:00:00.000Z`);
      targetDates.push(slotDate);

      let currentStart = startTime;
      while (true) {
        const currentEnd = addMinutes(currentStart, duration);
        if (currentEnd > endTime) break;
        candidateSlots.push({ date: slotDate, startTime: currentStart, endTime: currentEnd });
        
        const nextStart = addMinutes(currentStart, duration + buffer);
        if (nextStart <= currentStart) {
          break;
        }
        currentStart = nextStart;
      }
    }

    // Query once to find all existing slots on these target dates
    const existingSlots = await prisma.availabilitySlot.findMany({
      where: {
        propertyId,
        date: { in: targetDates }
      }
    });

    const getLookupKey = (d: Date, startTime: string) => {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return `${dateStr}:${startTime}`;
    };

    const existingKeys = new Set(existingSlots.map(s => getLookupKey(s.date, s.startTime)));

    // Filter candidate slots
    const newSlotsToCreate = candidateSlots.filter(c => !existingKeys.has(getLookupKey(c.date, c.startTime)));

    const allCreated = [];
    if (newSlotsToCreate.length > 0) {
      await prisma.availabilitySlot.createMany({
        data: newSlotsToCreate.map(c => ({
          propertyId,
          ownerId: finalOwnerId,
          date: c.date,
          startTime: c.startTime,
          endTime: c.endTime,
          slotDuration: duration,
          bufferTime: buffer,
          isRecurring: true,
          recurringDay: dayOfWeek,
          maxBookings: 1,
        }))
      });

      // Fetch all created slots on target dates
      const created = await prisma.availabilitySlot.findMany({
        where: {
          propertyId,
          date: { in: targetDates },
          isRecurring: true,
          recurringDay: dayOfWeek,
        }
      });
      allCreated.push(...created);
    }

    logDebug(`createRecurringSlots: Successfully created ${allCreated.length} slots`);
    res.status(201).json({ message: `${allCreated.length} recurring slot(s) created`, slots: allCreated });
  } catch (error) {
    logDebug(`createRecurringSlots error: ${error}`);
    console.error('createRecurringSlots error:', error);
    res.status(500).json({ error: 'Failed to create recurring slots' });
  }
};

// POST /api/availability/block — block a date (or range) for a property
export const blockDates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    logDebug(`blockDates: ownerId=${ownerId} body=${JSON.stringify(req.body)}`);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId, startDate, endDate } = req.body;
    if (!propertyId || !startDate) return res.status(400).json({ error: 'propertyId and startDate are required' });

    // Prevent blocking past dates
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const startStr = startDate.split('T')[0];
    if (startStr < todayStr) {
      logDebug(`blockDates: Past date blocking startStr=${startStr} todayStr=${todayStr}`);
      return res.status(400).json({ error: 'Cannot block dates in the past' });
    }

    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    if (!property) {
      logDebug(`blockDates: Property not found: ${propertyId}`);
      return res.status(404).json({ error: 'Property not found' });
    }

    const isAdmin = (req.user as any)?.isAdmin;
    if (property.ownerId !== ownerId && !isAdmin) {
      logDebug(`blockDates: Property not owned by user property.ownerId=${property.ownerId} ownerId=${ownerId}`);
      return res.status(403).json({ error: 'Property not found or not owned by you' });
    }

    const finalOwnerId = isAdmin ? property.ownerId : ownerId;
    const from = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`);
    const to = endDate ? new Date(`${endDate.split('T')[0]}T00:00:00.000Z`) : from;

    let d = from;
    let count = 0;
    while (d <= to) {
      // Create a blocked placeholder slot for the date
      await prisma.availabilitySlot.create({
        data: {
          propertyId,
          ownerId: finalOwnerId,
          date: d,
          startTime: '00:00',
          endTime: '23:59',
          isBlocked: true,
        }
      });
      d = addDays(d, 1);
      count++;
    }

    logDebug(`blockDates: Blocked ${count} dates`);
    res.status(201).json({ message: `${count} date(s) blocked` });
  } catch (error) {
    logDebug(`blockDates error: ${error}`);
    console.error('blockDates error:', error);
    res.status(500).json({ error: 'Failed to block dates' });
  }
};

// POST /api/availability/unblock — unblock a date (or range) for a property
export const unblockDates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    logDebug(`unblockDates: ownerId=${ownerId} body=${JSON.stringify(req.body)}`);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId, startDate, endDate } = req.body;
    if (!propertyId || !startDate) return res.status(400).json({ error: 'propertyId and startDate are required' });

    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    if (!property) {
      logDebug(`unblockDates: Property not found: ${propertyId}`);
      return res.status(404).json({ error: 'Property not found' });
    }

    const isAdmin = (req.user as any)?.isAdmin;
    if (property.ownerId !== ownerId && !isAdmin) {
      logDebug(`unblockDates: Property not owned by user property.ownerId=${property.ownerId} ownerId=${ownerId}`);
      return res.status(403).json({ error: 'Property not found or not owned by you' });
    }

    const from = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`);
    const to = endDate ? new Date(`${endDate.split('T')[0]}T00:00:00.000Z`) : from;

    // Delete all blocked placeholder slots in the date range
    const result = await prisma.availabilitySlot.deleteMany({
      where: {
        propertyId,
        isBlocked: true,
        date: {
          gte: from,
          lte: to
        }
      }
    });

    logDebug(`unblockDates: Unblocked ${result.count} dates`);
    res.status(200).json({ message: `${result.count} date(s) unblocked` });
  } catch (error) {
    logDebug(`unblockDates error: ${error}`);
    console.error('unblockDates error:', error);
    res.status(500).json({ error: 'Failed to unblock dates' });
  }
};

// GET /api/availability/property/:propertyId — get all slots for a property (public)
export const getSlotsByProperty = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { from, to } = req.query;

    const where: any = { propertyId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(`${(from as string).split('T')[0]}T00:00:00.000Z`);
      if (to) where.date.lte = new Date(`${(to as string).split('T')[0]}T00:00:00.000Z`);
    }

    const slots = await prisma.availabilitySlot.findMany({
      where,
      include: {
        bookings: {
          select: { id: true, status: true, tenantId: true }
        }
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });

    res.status(200).json(slots);
  } catch (error) {
    console.error('getSlotsByProperty error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

// GET /api/availability/owner — owner's own slots
export const getOwnerSlots = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId, from, to } = req.query;
    const isAdmin = (req.user as any)?.isAdmin;
    const where: any = {};
    if (!isAdmin) {
      where.ownerId = ownerId;
    } else if (req.query.ownerId) {
      where.ownerId = req.query.ownerId as string;
    }
    
    if (propertyId) where.propertyId = propertyId as string;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(`${(from as string).split('T')[0]}T00:00:00.000Z`);
      if (to) where.date.lte = new Date(`${(to as string).split('T')[0]}T00:00:00.000Z`);
    }

    const slots = await prisma.availabilitySlot.findMany({
      where,
      include: {
        property: { select: { title: true } },
        bookings: {
          select: { id: true, status: true, tenant: { select: { firstName: true, lastName: true, email: true } } }
        }
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });

    res.status(200).json(slots);
  } catch (error) {
    console.error('getOwnerSlots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

// PATCH /api/availability/:id — edit a slot
export const updateSlot = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    const { id } = req.params;
    const isAdmin = (req.user as any)?.isAdmin;
    const where: any = { id };
    if (!isAdmin) {
      where.ownerId = ownerId;
    }

    const slot = await prisma.availabilitySlot.findFirst({ where });
    if (!slot) return res.status(404).json({ error: 'Slot not found or not owned by you' });

    const updated = await prisma.availabilitySlot.update({
      where: { id },
      data: {
        startTime: req.body.startTime ?? slot.startTime,
        endTime: req.body.endTime ?? slot.endTime,
        slotDuration: req.body.slotDuration ?? slot.slotDuration,
        bufferTime: req.body.bufferTime ?? slot.bufferTime,
        isBlocked: req.body.isBlocked ?? slot.isBlocked,
        maxBookings: req.body.maxBookings ?? slot.maxBookings,
      }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('updateSlot error:', error);
    res.status(500).json({ error: 'Failed to update slot' });
  }
};

// DELETE /api/availability/:id
export const deleteSlot = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    const { id } = req.params;
    const isAdmin = (req.user as any)?.isAdmin;
    const where: any = { id };
    if (!isAdmin) {
      where.ownerId = ownerId;
    }

    const slot = await prisma.availabilitySlot.findFirst({ where });
    if (!slot) return res.status(404).json({ error: 'Slot not found or not owned by you' });

    await prisma.availabilitySlot.delete({ where: { id } });
    res.status(200).json({ message: 'Slot deleted' });
  } catch (error) {
    console.error('deleteSlot error:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

// PATCH /api/availability/settings — update owner booking settings
export const updateOwnerSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { autoApprove, slotDuration, bufferTime, maxBookingsPerDay } = req.body;

    const updated = await prisma.user.update({
      where: { id: ownerId },
      data: {
        autoApprove: autoApprove ?? undefined,
        slotDuration: slotDuration ?? undefined,
        bufferTime: bufferTime ?? undefined,
        maxBookingsPerDay: maxBookingsPerDay ?? undefined,
      },
      select: { autoApprove: true, slotDuration: true, bufferTime: true, maxBookingsPerDay: true }
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('updateOwnerSettings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// GET /api/availability/settings — get owner booking settings
export const getOwnerSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = (req.user as any)?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { autoApprove: true, slotDuration: true, bufferTime: true, maxBookingsPerDay: true }
    });

    res.status(200).json(user);
  } catch (error) {
    console.error('getOwnerSettings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
};
