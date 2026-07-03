import cron from 'node-cron';
import { addDays } from 'date-fns';
import { prisma } from '../config/db';

// Helper: add minutes to a "HH:MM" string → return "HH:MM"
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export async function generateTodayBookingReminders(io?: any) {
  console.log('⏰ Running job to generate today\'s booking reminders...');
  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const todaysBookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        slot: {
          date: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      },
      include: {
        slot: true,
        property: { select: { title: true, ownerId: true } },
        tenant: { select: { firstName: true, lastName: true, id: true } },
      },
    });

    console.log(`Found ${todaysBookings.length} confirmed bookings scheduled for today.`);

    for (const booking of todaysBookings) {
      // 1. Tenant Reminder
      const tenantNotifExists = await prisma.notification.findFirst({
        where: {
          userId: booking.tenantId,
          bookingId: booking.id,
          type: 'booking_reminder'
        }
      });
      if (!tenantNotifExists) {
        await prisma.notification.create({
          data: {
            userId: booking.tenantId,
            title: 'Visit Scheduled Today',
            message: `Reminder: You have a scheduled visit for ${booking.property.title} today at ${booking.slot.startTime}.`,
            type: 'booking_reminder',
            bookingId: booking.id
          }
        });
        if (io) {
          io.emit('notification', { userId: booking.tenantId });
        }
      }

      // 2. Owner Reminder
      const ownerNotifExists = await prisma.notification.findFirst({
        where: {
          userId: booking.property.ownerId,
          bookingId: booking.id,
          type: 'booking_reminder'
        }
      });
      if (!ownerNotifExists) {
        const tenantName = `${booking.tenant.firstName || ''} ${booking.tenant.lastName || ''}`.trim();
        await prisma.notification.create({
          data: {
            userId: booking.property.ownerId,
            title: 'Visit Scheduled Today',
            message: `Reminder: Tenant ${tenantName} is scheduled to visit ${booking.property.title} today at ${booking.slot.startTime}.`,
            type: 'booking_reminder',
            bookingId: booking.id
          }
        });
        if (io) {
          io.emit('notification', { userId: booking.property.ownerId });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error generating today\'s booking reminders:', error);
  }
}

export function startCronJobs(io?: any) {
  console.log('⏳ Starting background cron jobs...');

  // Generate today's reminders on startup
  generateTodayBookingReminders(io);

  // 3. Daily Booking Reminders (Runs daily at 12:05 AM)
  cron.schedule('5 0 * * *', () => {
    generateTodayBookingReminders(io);
  });

  // 1. Extend Recurring Slots (Runs every Sunday at Midnight)
  cron.schedule('0 0 * * 0', async () => {
    console.log('🔄 Running weekly cron job to extend recurring slots...');
    try {
      // Find all recurring slots templates (just distinct properties/owners with recurring slots)
      // Since our schema generates individual slots with isRecurring=true, we can find distinct recurring setups.
      const recurringSlots = await prisma.availabilitySlot.findMany({
        where: { isRecurring: true },
        distinct: ['propertyId', 'recurringDay', 'startTime'],
      });

      let createdCount = 0;
      for (const tmpl of recurringSlots) {
        if (tmpl.recurringDay === null) continue;

        // Generate slots for 4 weeks ahead
        const today = new Date();
        let start = new Date(today);
        while (start.getDay() !== tmpl.recurringDay) {
          start = addDays(start, 1);
        }

        for (let w = 0; w < 4; w++) {
          const d = addDays(start, w * 7);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const slotDate = new Date(`${dateStr}T00:00:00.000Z`);

          let currentStart = tmpl.startTime;
          while (true) {
            const currentEnd = addMinutes(currentStart, tmpl.slotDuration);
            if (currentEnd > tmpl.endTime) break;

            const existing = await prisma.availabilitySlot.findFirst({
              where: { propertyId: tmpl.propertyId, date: slotDate, startTime: currentStart }
            });

            if (!existing) {
              await prisma.availabilitySlot.create({
                data: {
                  propertyId: tmpl.propertyId,
                  ownerId: tmpl.ownerId,
                  date: slotDate,
                  startTime: currentStart,
                  endTime: currentEnd,
                  slotDuration: tmpl.slotDuration,
                  bufferTime: tmpl.bufferTime,
                  isRecurring: true,
                  recurringDay: tmpl.recurringDay,
                  maxBookings: tmpl.maxBookings,
                }
              });
              createdCount++;
            }
            currentStart = addMinutes(currentStart, tmpl.slotDuration + tmpl.bufferTime);
          }
        }
      }
      console.log(`✅ Weekly recurring slots extended. Created ${createdCount} new slots.`);
    } catch (error) {
      console.error('❌ Error extending recurring slots:', error);
    }
  });

  // 2. Auto-complete Past Bookings (Runs daily at 11:59 PM)
  cron.schedule('59 23 * * *', async () => {
    console.log('🔄 Running daily cron job to auto-complete past bookings...');
    try {
      const now = new Date();
      // Find all confirmed bookings where the slot's date is in the past
      // Since slot date is stored as UTC midnight, we can just compare it to yesterday
      const yesterday = addDays(now, -1);
      
      const updated = await prisma.booking.updateMany({
        where: {
          status: 'CONFIRMED',
          slot: {
            date: {
              lt: yesterday
            }
          }
        },
        data: {
          status: 'COMPLETED'
        }
      });
      console.log(`✅ Auto-completed ${updated.count} past bookings.`);
    } catch (error) {
      console.error('❌ Error auto-completing bookings:', error);
    }
  });

  // 4. Check for Expired Agreements on startup and runs daily at 12:10 AM
  checkExpiredAgreements(io);
  cron.schedule('10 0 * * *', () => {
    checkExpiredAgreements(io);
  });

  console.log('✅ Cron jobs initialized.');
}

export async function checkExpiredAgreements(io?: any) {
  console.log('🔄 Checking for expired lease agreements...');
  try {
    const activeAgreements = await prisma.leaseAgreement.findMany({
      where: {
        status: 'Active'
      }
    });

    const now = new Date();

    for (const agreement of activeAgreements) {
      if (!agreement.endDate) continue;

      const parsedEndDate = Date.parse(agreement.endDate);
      if (isNaN(parsedEndDate)) {
        console.warn(`Could not parse end date string: "${agreement.endDate}" for agreement ${agreement.id}`);
        continue;
      }

      const endDateObj = new Date(parsedEndDate);
      // set to end of the day for expiration check (23:59:59.999)
      endDateObj.setHours(23, 59, 59, 999);

      if (endDateObj < now) {
        console.log(`Agreement ${agreement.id} has expired (End date: ${agreement.endDate}). Updating status to Expired...`);

        // Update status to 'Expired'
        await prisma.leaseAgreement.update({
          where: { id: agreement.id },
          data: { status: 'Expired' }
        });

        // 1. Notify Landlord
        let landlordUser = null;
        if (agreement.landlordId) {
          landlordUser = await prisma.user.findUnique({ where: { id: agreement.landlordId } });
        } else {
          landlordUser = await prisma.user.findFirst({ where: { email: agreement.landlordEmail } });
        }

        if (landlordUser) {
          await prisma.notification.create({
            data: {
              userId: landlordUser.id,
              title: 'Lease Agreement Expired 📜',
              message: `The lease agreement for ${agreement.listingName} with tenant ${agreement.tenantName} has expired.`,
              type: 'Agreement'
            }
          });
          if (io) {
            io.emit('notification', { userId: landlordUser.id });
          }
        }

        // 2. Notify Tenant
        let tenantUser = null;
        if (agreement.tenantId) {
          tenantUser = await prisma.user.findUnique({ where: { id: agreement.tenantId } });
        } else {
          tenantUser = await prisma.user.findFirst({ where: { email: agreement.tenantEmail } });
        }

        if (tenantUser) {
          await prisma.notification.create({
            data: {
              userId: tenantUser.id,
              title: 'Lease Agreement Expired 📜',
              message: `Your lease agreement for ${agreement.listingName} with landlord ${agreement.landlordName} has expired.`,
              type: 'Agreement'
            }
          });
          if (io) {
            io.emit('notification', { userId: tenantUser.id });
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking expired lease agreements:', error);
  }
}
