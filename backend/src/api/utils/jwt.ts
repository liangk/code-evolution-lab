import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tv: tokenVersion, type: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
}


export function verifyAccessToken(token: string): { sub: string; type: string } {
  const payload = jwt.verify(token, JWT_SECRET) as any;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): { sub: string; tv: number; type: string } {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET) as any;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

