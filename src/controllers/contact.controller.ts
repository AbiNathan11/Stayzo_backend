import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendReplyEmail } from '../services/email.service';

const prisma = new PrismaClient();

export const createContactMessage = async (req: Request, res: Response) => {
  try {
    const { fullName, email, subject, message } = req.body;

    if (!fullName || !email || !message) {
      return res.status(400).json({ error: 'Full name, email, and message are required' });
    }

    const newMessage = await prisma.contactMessage.create({
      data: {
        fullName,
        email,
        subject: subject || 'General Inquiry',
        message,
        status: 'Unread'
      }
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error creating contact message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getContactMessages = async (req: Request, res: Response) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMessageStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'Read' or 'Unread'

    if (!status || (status !== 'Read' && status !== 'Unread')) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status }
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteContactMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.contactMessage.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const replyToContactMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { replyMessage } = req.body;

    if (!replyMessage) {
      return res.status(400).json({ error: 'Reply message is required' });
    }

    const messageRecord = await prisma.contactMessage.findUnique({
      where: { id }
    });

    if (!messageRecord) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const emailSent = await sendReplyEmail(
      messageRecord.email,
      messageRecord.subject || 'General Inquiry',
      replyMessage,
      messageRecord.message
    );

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send reply email' });
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'Read' }
    });

    res.status(200).json({ message: 'Reply sent successfully', updated });
  } catch (error) {
    console.error('Error replying to contact message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
