import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log("No users found in the database. Please sign up in the app first.");
    return;
  }
  
  // Pick the first user as the owner (likely the account you are currently testing with)
  const owner = users[0];
  console.log(`Using owner: ${owner.email} (${owner.firstName} ${owner.lastName})`);

  const prop1 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      title: 'Sunny Studio in Downtown',
      description: 'A beautiful and bright studio apartment right in the heart of the city.',
      price: 1500,
      address: '123 Main St',
      city: 'Metropolis',
      state: 'NY',
      zipCode: '10001',
      bedrooms: 1,
      bathrooms: 1,
      sqft: 600,
      type: 'Apartment',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1f2d9368ce?auto=format&fit=crop&q=80&w=800'],
      amenities: ['WiFi', 'Air Conditioning', 'Gym']
    }
  });

  const prop2 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      title: 'Cozy Suburban Home',
      description: 'A quiet 3-bedroom house perfect for a family.',
      price: 2500,
      address: '456 Oak Lane',
      city: 'Smallville',
      state: 'KS',
      zipCode: '66002',
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1500,
      type: 'House',
      images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800'],
      amenities: ['Parking', 'Backyard', 'In-unit Laundry']
    }
  });

  console.log(`✅ Created property 1: ${prop1.title}`);
  console.log(`✅ Created property 2: ${prop2.title}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
