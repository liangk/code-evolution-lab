import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE, SESSION_ID_COOKIE } from '../utils/constants';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  const sessionId = req.cookies?.[SESSION_ID_COOKIE];
  if (sessionId) {
    req.sessionId = sessionId;
  } else {
    req.sessionId = undefined;
  }
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
