import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy_key', // This is just a fallback for types if not provided
});

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

export const getUserThreads = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.query; // 'tenant' or 'owner'

    let threads = [];
    if (role === 'owner') {
      threads = await prisma.chatThread.findMany({
        where: { ownerId: userId },
        include: {
          tenant: true,
          property: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1, // Get the latest message for the preview
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
    } else {
      threads = await prisma.chatThread.findMany({
        where: { tenantId: userId },
        include: {
          owner: true,
          property: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
    }

    return res.status(200).json({ threads });
  } catch (error) {
    console.error('getUserThreads error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { senderId, text } = req.body;

    if (!senderId || !text) {
      return res.status(400).json({ error: 'senderId and text are required' });
    }

    const thread = await prisma.chatThread.findUnique({ where: { id } });
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        threadId: id,
        senderId,
        text,
      }
    });

    // Update thread's updatedAt to sort by recent activity
    await prisma.chatThread.update({
      where: { id },
      data: { updatedAt: new Date() }
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const translateMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetLanguage } = req.body;

    if (!targetLanguage) {
      return res.status(400).json({ error: 'targetLanguage is required' });
    }

    const message = await prisma.chatMessage.findUnique({ where: { id } });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // If it's already translated to this language, just return it
    if (message.translatedLanguage === targetLanguage && message.translatedText) {
      return res.status(200).json({ message });
    }

    // Call OpenAI for translation
    const prompt = `Translate the following chat message into ${targetLanguage}. Return only the direct translation without any extra conversational filler or quotation marks.\n\nMessage: "${message.text}"`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini', // or another preferred model
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() || message.text;

    const updatedMessage = await prisma.chatMessage.update({
      where: { id },
      data: {
        translatedText,
        translatedLanguage: targetLanguage,
      },
    });

    return res.status(200).json({ message: updatedMessage });
  } catch (error) {
    console.error('translateMessage error:', error);
    return res.status(500).json({ error: 'Internal server error during translation', details: error instanceof Error ? error.message : String(error) });
  }
};

