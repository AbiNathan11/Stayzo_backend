import { PrismaClient } from '@prisma/client';
import { geocodeAddress } from '../src/services/noise.service';

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING DATABASE GEOCODING CORRECTION ---');
  
  const properties = await prisma.property.findMany();
  console.log(`Found ${properties.length} total properties in the database.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const p of properties) {
    const lat = p.latitude;
    const lng = p.longitude;
    
    const hasCoords = lat !== null && lat !== 0 && lng !== null && lng !== 0;
    
    const fullAddress = [p.address, p.city, p.state, p.zipCode]
      .filter(Boolean)
      .join(', ');

    if (hasCoords) {
      console.log(`[SKIP] "${p.title}" already has coordinates: ${lat}, ${lng}`);
      skippedCount++;
      continue;
    }

    if (!fullAddress.trim()) {
      console.log(`[SKIP] "${p.title}" has an empty address.`);
      skippedCount++;
      continue;
    }

    console.log(`[GEOCODE] Geocoding "${p.title}" at: "${fullAddress}"`);
    try {
      const coords = await geocodeAddress(fullAddress);
      if (coords) {
        await prisma.property.update({
          where: { id: p.id },
          data: {
            latitude: coords.lat,
            longitude: coords.lng
          }
        });
        console.log(`  [SUCCESS] Coordinates resolved and saved: ${coords.lat}, ${coords.lng}`);
        updatedCount++;
      } else {
        console.log(`  [FAILED] Could not geocode address: "${fullAddress}"`);
        failedCount++;
      }
    } catch (err) {
      console.error(`  [ERROR] Geocoding error for "${p.title}":`, err);
      failedCount++;
    }
    
    // Sleep for 200ms to be safe with rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log('\n--- GEOCODING RUN SUMMARY ---');
  console.log(`Total properties processed: ${properties.length}`);
  console.log(`Successfully updated coordinates: ${updatedCount}`);
  console.log(`Skipped (already have coords or empty address): ${skippedCount}`);
  console.log(`Failed to geocode: ${failedCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
