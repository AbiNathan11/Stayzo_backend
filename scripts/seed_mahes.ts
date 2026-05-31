import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find the specific user testing right now
  const targetUser = await prisma.user.findUnique({
    where: { email: 'mahesaberam@gmail.com' }
  });

  if (!targetUser) {
    console.log("Could not find mahesaberam@gmail.com");
    return;
  }

  const prop1 = await prisma.property.create({
    data: {
      ownerId: targetUser.id,
      title: 'Luxury Villa Test',
      description: 'A beautiful test property.',
      price: 1500,
      address: '123 Test St',
      city: 'Testville',
      state: 'NY',
      zipCode: '10001',
      bedrooms: 4,
      bathrooms: 3,
      sqft: 2600,
      type: 'Villa',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1f2d9368ce?auto=format&fit=crop&q=80&w=800'],
      amenities: ['WiFi', 'Air Conditioning', 'Gym']
    }
  });

  const prop2 = await prisma.property.create({
    data: {
      ownerId: targetUser.id,
      title: 'Downtown Apartment',
      description: 'Test apartment.',
      price: 2500,
      address: '456 Oak Lane',
      city: 'Metropolis',
      state: 'KS',
      zipCode: '66002',
      bedrooms: 2,
      bathrooms: 2,
      sqft: 1500,
      type: 'Apartment',
      images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800'],
      amenities: ['Parking', 'Balcony']
    }
  });

  console.log(`✅ Assigned properties to ${targetUser.email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
