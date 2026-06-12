import { Request, Response } from 'express';
import { prisma } from '../config/db';

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const { type, amount, user, email, targetListing, status, reference, paymentMethod, ipAddress } = req.body;

    if (!type || !amount || !user || !email || !targetListing || !reference || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required transaction fields' });
    }

    const newTransaction = await prisma.transaction.create({
      data: {
        type,
        amount: Number(amount),
        user,
        email,
        targetListing,
        status: status || 'Pending',
        reference,
        paymentMethod,
        ipAddress: ipAddress || '127.0.0.1'
      }
    });

    res.status(201).json(newTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.transaction.delete({
      where: { id }
    });
    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
