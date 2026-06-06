import { PrismaClient } from '@prisma/client';
import { geocodeAddress, calculateNoise } from '../src/services/noise.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching properties from database...');
  const properties = await prisma.property.findMany({
    include: { noiseAnalysis: true }
  });

  console.log(`Found ${properties.length} properties. Starting geocoding and noise analysis...`);

  for (const property of properties) {
    const fullAddress = [property.address, property.city, property.state, property.zipCode]
      .filter(Boolean)
      .join(', ');

    console.log(`\n----------------------------------------`);
    console.log(`Processing property: "${property.title}"`);
    console.log(`Address: "${fullAddress}"`);

    if (!fullAddress.trim()) {
      console.warn(`[SKIP] Empty address for property ID ${property.id}`);
      continue;
    }

    try {
      console.log('Geocoding address...');
      const coords = await geocodeAddress(fullAddress);
      
      if (!coords) {
        console.warn(`[WARN] Geocoding returned null for address: "${fullAddress}"`);
        continue;
      }

      console.log(`Resolved coordinates: Lat ${coords.lat}, Lng ${coords.lng}`);
      console.log('Calculating noise analysis...');
      const noiseResult = await calculateNoise(coords.lat, coords.lng);

      console.log(`Noise Score: ${noiseResult.noiseScore}/100 (${noiseResult.noiseLevel})`);
      console.log(`Contributing factors count: ${noiseResult.factors.length}`);

      // Update property with coordinates
      await prisma.property.update({
        where: { id: property.id },
        data: {
          latitude: coords.lat,
          longitude: coords.lng
        }
      });
      console.log(`Updated property coordinates in database.`);

      // Upsert noise analysis
      if (property.noiseAnalysis) {
        await prisma.noiseAnalysis.update({
          where: { propertyId: property.id },
          data: {
            noiseScore: noiseResult.noiseScore,
            noiseLevel: noiseResult.noiseLevel,
            factors: noiseResult.factors as any,
            calculatedAt: new Date()
          }
        });
        console.log(`Updated existing NoiseAnalysis record.`);
      } else {
        await prisma.noiseAnalysis.create({
          data: {
            propertyId: property.id,
            noiseScore: noiseResult.noiseScore,
            noiseLevel: noiseResult.noiseLevel,
            factors: noiseResult.factors as any
          }
        });
        console.log(`Created new NoiseAnalysis record.`);
      }
      console.log(`[SUCCESS] Property "${property.title}" processed successfully.`);

    } catch (error) {
      console.error(`[ERROR] Failed to process property "${property.title}":`, error);
    }
  }

  console.log(`\n----------------------------------------`);
  console.log('Database noise analysis population complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
