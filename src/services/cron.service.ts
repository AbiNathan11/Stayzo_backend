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

export function startCronJobs() {
  console.log('⏳ Starting background cron jobs...');

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

  console.log('✅ Cron jobs initialized.');
}
