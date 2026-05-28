import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createProperty = async (req: Request, res: Response) => {
  try {
    const {
      ownerId,
      title,
      description,
      price,
      address,
      city,
      state,
      zipCode,
      bedrooms,
      bathrooms,
      sqft,
      type,
      images,
      panoramaImage,
      waterBillImage,
      amenities
    } = req.body;

    if (!ownerId || !title || !price) {
      return res.status(400).json({ error: 'ownerId, title, and price are required' });
    }

    const property = await prisma.property.create({
      data: {
        ownerId,
        title,
        description: description || '',
        price: parseFloat(price),
        address: address || '',
        city,
        state,
        zipCode,
        bedrooms: bedrooms ? parseInt(bedrooms) : 0,
        bathrooms: bathrooms ? parseFloat(bathrooms) : 0,
        sqft: sqft ? parseFloat(sqft) : 0,
        type: type || 'Apartment',
        images: images || [],
        panoramaImage,
        waterBillImage,
        amenities: amenities || []
      }
    });

    res.status(201).json(property);
  } catch (error: any) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Failed to create property' });
  }
};

export const getProperties = async (req: Request, res: Response) => {
  try {
    const properties = await prisma.property.findMany({
      include: { owner: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(properties);
  } catch (error: any) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
};

export const getPropertyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await prisma.property.findUnique({
      where: { id },
      include: { owner: { select: { firstName: true, lastName: true, email: true } } }
    });
    
    if (!property) return res.status(404).json({ error: 'Property not found' });
    
    res.status(200).json(property);
  } catch (error: any) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
};
