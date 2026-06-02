import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const findOrCreateThread = async (req: Request, res: Response) => {
  try {
    const { tenantId, propertyId } = req.body;

    if (!tenantId || !propertyId) {
      return res.status(400).json({ error: 'tenantId and propertyId are required' });
    }

    // 1. Verify property and get ownerId
    const property = await prisma.property.findUnique({
      where: { id: propertyId }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const ownerId = property.ownerId;

    // 2. Prevent owner from chatting with themselves
    if (tenantId === ownerId) {
      return res.status(400).json({ error: 'Cannot start a chat with yourself' });
    }

    // 3. Find existing thread or create a new one
    let thread = await prisma.chatThread.findUnique({
      where: {
        tenantId_ownerId_propertyId: {
          tenantId,
          ownerId,
          propertyId,
        }
      },
      include: {
        property: true,
        owner: true,
        tenant: true
      }
    });

    if (!thread) {
      thread = await prisma.chatThread.create({
        data: {
          tenantId,
          ownerId,
          propertyId,
        },
        include: {
          property: true,
          owner: true,
          tenant: true
        }
      });
    }

    return res.status(200).json({ thread });
  } catch (error) {
    console.error('findOrCreateThread error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getThreadDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const thread = await prisma.chatThread.findUnique({
      where: { id },
      include: {
        property: true,
        owner: true,
        tenant: true,
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    return res.status(200).json({ thread });
  } catch (error) {
    console.error('getThreadDetails error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
