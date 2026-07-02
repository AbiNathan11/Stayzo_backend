import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';

// Helper to log debug info to a file since we cannot view the terminal output directly
function logDebug(message: string) {
  console.log(message);
}

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
  logDebug(`authenticateJWT: path=${req.originalUrl || req.path} method=${req.method} authHeader=${authHeader ? 'present' : 'missing'}`);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback_secret', 
      (err, decoded) => {
        if (err) {
          logDebug(`authenticateJWT: JWT verification failed: ${err.message}`);
          return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
        }

        // Attach user decoded information to request context
        req.user = decoded as AuthenticatedRequest['user'];
        logDebug(`authenticateJWT: Success: ${JSON.stringify(req.user)}`);
        next();
      }
    );
  } else {
    logDebug(`authenticateJWT: No Bearer token provided`);
    res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
};

// Authorization checks
export const requireAdmin = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  logDebug(`requireAdmin: user=${JSON.stringify(req.user)}`);
  if (!req.user || !req.user.isAdmin) {
    logDebug(`requireAdmin: Forbidden`);
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};

export const requireOwner = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  logDebug(`requireOwner: user=${JSON.stringify(req.user)}`);
  if (!req.user || (!req.user.isOwner && !req.user.isAdmin)) {
    logDebug(`requireOwner: Forbidden`);
    return res.status(403).json({ error: 'Forbidden: Owner access required' });
  }
  next();
};

export const requireTenant = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  logDebug(`requireTenant: user=${JSON.stringify(req.user)}`);
  if (!req.user || (!req.user.isTenant && !req.user.isAdmin)) {
    logDebug(`requireTenant: Forbidden`);
    return res.status(403).json({ error: 'Forbidden: Tenant access required' });
  }
  next();
};
