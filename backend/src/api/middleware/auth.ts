import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE, SESSION_ID_COOKIE } from '../utils/constants';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  sessionId?: string;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: '' };
    req.sessionId = req.cookies?.[SESSION_ID_COOKIE];
    return next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: '' };
    } catch {
      // Token invalid, continue without user
    }
  }
  next();
};
