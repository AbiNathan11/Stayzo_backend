import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const createReview = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { propertyId, rating, comment } = authReq.body;

    if (!propertyId || rating === undefined || rating === null || comment === undefined || comment === null) {
      return res.status(400).json({ error: 'Missing required review fields: propertyId, rating, comment' });
    }

    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    if (typeof comment !== 'string' || comment.trim() === '') {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    if (!authReq.user?.id) {
      return res.status(401).json({ error: 'Unauthorized: User context missing' });
    }

    // Check if the user has already reviewed this property
    const existingReview = await prisma.review.findFirst({
      where: {
        authorId: authReq.user.id,
        propertyId
      }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this property' });
    }

    // Fetch the property to get its title as targetName
    const property = await prisma.property.findUnique({
      where: { id: propertyId }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const newReview = await prisma.review.create({
      data: {
        authorId: authReq.user.id,
        authorName: `${authReq.user.firstName || ''} ${authReq.user.lastName || ''}`.trim() || authReq.user.email,
        authorEmail: authReq.user.email,
        propertyId,
        rating: numericRating,
        comment: comment.trim(),
        targetName: property.title,
        status: 'Approved',
        sentiment: 'Neutral',
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
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        property: {
          include: {
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReviewsByProperty = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ error: 'propertyId parameter is required' });
    }

    const reviews = await prisma.review.findMany({
      where: { 
        propertyId,
        status: { not: 'Flagged' }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews by property:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReviewsByOwner = async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.params;

    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId parameter is required' });
    }

    const reviews = await prisma.review.findMany({
      where: {
        property: {
          ownerId: ownerId
        },
        status: { not: 'Flagged' }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        property: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews by owner:', error);
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

