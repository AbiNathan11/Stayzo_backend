import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Custom Request Interface to hold the authenticated user context
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    isAdmin?: boolean;
    isOwner?: boolean;
    isTenant?: boolean;
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

// Authorization checks
export const requireAdmin = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};

export const requireOwner = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  if (!req.user || (!req.user.isOwner && !req.user.isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Owner access required' });
  }
  next();
};

export const requireTenant = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  if (!req.user || (!req.user.isTenant && !req.user.isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Tenant access required' });
  }
  next();
};
