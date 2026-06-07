import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient() as any;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy_key', // This is just a fallback for types if not provided
});

export const findOrCreateThread = async (req: Request, res: Response) => {
  try {
    const { tenantId, propertyId } = req.body;
    const authReq = req as AuthenticatedRequest;

    if (!tenantId || !propertyId) {
      return res.status(400).json({ error: 'tenantId and propertyId are required' });
    }

    if (authReq.user?.id !== tenantId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only start threads as yourself' });
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
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
};

export const getThreadDetails = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
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

    if (authReq.user?.id !== thread.tenantId && authReq.user?.id !== thread.ownerId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Access denied to this thread' });
    }

    return res.status(200).json({ thread });
  } catch (error) {
    console.error('getThreadDetails error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
};

export const getUserThreads = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { userId } = req.params;
    const { role } = req.query; // 'tenant' or 'owner'

    const threads = role === 'owner'
      ? await prisma.chatThread.findMany({
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
        })
      : await prisma.chatThread.findMany({
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

    return res.status(200).json({ threads });
  } catch (error) {
    console.error('getUserThreads error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const { senderId, text } = req.body;

    if (!senderId || !text) {
      return res.status(400).json({ error: 'senderId and text are required' });
    }

    if (authReq.user?.id !== senderId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You cannot send messages as someone else' });
    }

    const thread = await prisma.chatThread.findUnique({ where: { id } });
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (authReq.user?.id !== thread.tenantId && authReq.user?.id !== thread.ownerId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You are not a participant in this thread' });
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
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
};

export const translateMessage = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
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

    const thread = await prisma.chatThread.findUnique({ where: { id: message.threadId } });
    if (!thread) {
      return res.status(404).json({ error: 'Associated thread not found' });
    }

    if (authReq.user?.id !== thread.tenantId && authReq.user?.id !== thread.ownerId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You are not a participant in this thread' });
    }

    // If it's already translated to this language, just return it
    if (message.translatedLanguage === targetLanguage && message.translatedText) {
      return res.status(200).json({ message });
    }

    // Call OpenAI for translation
    const systemPrompt = `You are an expert bilingual translator for a real estate property rental platform in Sri Lanka.
Translate the following chat message accurately into ${targetLanguage}.
- Preserve the exact tone, intent, and casual nuance of the original message.
- Use natural, everyday phrasing that a native speaker would use.
- Do NOT include any explanations, quotation marks, or conversational filler in your output. Just the raw translated text.`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Message to translate:\n"${message.text}"` }
      ],
      model: 'gpt-4o', // Upgraded to gpt-4o for parity with ChatGPT's translation accuracy
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

