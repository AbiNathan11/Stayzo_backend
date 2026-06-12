import { Request, Response } from 'express';
import { prisma } from '../config/db';

export const createReview = async (req: Request, res: Response) => {
  try {
    const { authorName, authorEmail, rating, sentiment, comment, targetName } = req.body;

    if (!authorName || !authorEmail || !rating || !comment || !targetName) {
      return res.status(400).json({ error: 'Missing required review fields' });
    }

    const newReview = await prisma.review.create({
      data: {
        authorName,
        authorEmail,
        rating: Number(rating),
        sentiment: sentiment || 'Neutral',
        comment,
        targetName,
        status: 'Pending',
        likes: 0
      }
    });

    res.status(201).json(newReview);
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReviews = async (req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.review.update({
      where: { id },
      data: { status: 'Approved' }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error approving review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const flagReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.review.update({
      where: { id },
      data: { status: 'Flagged' }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error flagging review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.review.delete({
      where: { id }
    });
    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
