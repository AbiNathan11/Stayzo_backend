import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Custom Request Interface to hold the authenticated user context
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export const authenticateJWT = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback_secret', 
      (err, decoded) => {
        if (err) {
          return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
        }

        // Attach user decoded information to request context
        req.user = decoded as AuthenticatedRequest['user'];
        next();
      }
    );
  } else {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
};
