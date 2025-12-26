import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_EMAIL_SECRET = process.env.JWT_EMAIL_SECRET || 'your-email-secret-key';
const JWT_RESET_SECRET = process.env.JWT_RESET_SECRET || 'your-reset-secret-key';
const JWT_TWOFA_SECRET = process.env.JWT_TWOFA_SECRET || 'your-2fa-secret-key';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tv: tokenVersion, type: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
}

export function signEmailVerificationToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'email_verification' }, JWT_EMAIL_SECRET, {
    expiresIn: '24h',
  });
}

export function signPasswordResetToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'password_reset' }, JWT_RESET_SECRET, { expiresIn: '1h' });
}

export function signTwoFAToken(userId: string, nonce: string): string {
  return jwt.sign({ sub: userId, nonce, type: '2fa' }, JWT_TWOFA_SECRET, { expiresIn: '5m' });
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

export function verifyEmailVerificationToken(token: string): { sub: string; type: string } {
  const payload = jwt.verify(token, JWT_EMAIL_SECRET) as any;
  if (payload.type !== 'email_verification') throw new Error('Invalid token type');
  return payload;
}

export function verifyPasswordResetToken(token: string): { sub: string; type: string } {
  const payload = jwt.verify(token, JWT_RESET_SECRET) as any;
  if (payload.type !== 'password_reset') throw new Error('Invalid token type');
  return payload;
}

export function verifyTwoFAToken(token: string): { sub: string; nonce: string; type: string } {
  const payload = jwt.verify(token, JWT_TWOFA_SECRET) as any;
  if (payload.type !== '2fa') throw new Error('Invalid token type');
  return payload;
}
