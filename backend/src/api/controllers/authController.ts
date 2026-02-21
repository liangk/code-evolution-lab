import { Request, Response, NextFunction } from 'express';
import { createUser, getUserById, validateUser } from '../services/authService';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  IS_PROD,
  SESSION_ID_COOKIE,
} from '../utils/constants';
import prisma from '../prisma';
import { verifyTurnstile } from '../utils/captcha';
import { parseDevice, getClientIp } from '../utils/deviceParser';

function setAccessCookie(res: Response, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const { email, password, name, role, captchaToken } = req.body as {
      email: string;
      password: string;
      name?: string;
      role: 'customer' | 'tuner';
      captchaToken?: string;
    };

    const ipForCaptcha = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const captchaOk = await verifyTurnstile(captchaToken, ipForCaptcha);
    if (!captchaOk) return res.status(400).json({ message: 'Captcha verification failed' });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.authProvider) {
      return res.status(409).json({
        message: `This email is already registered with ${existingUser.authProvider}. Please login with ${existingUser.authProvider} instead.`,
        code: 'SOCIAL_LOGIN_REQUIRED',
      });
    }

    if (!role || (role !== 'customer' && role !== 'tuner')) {
      return res.status(400).json({ message: 'role must be either "customer" or "tuner"' });
    }

    const user = await createUser(email, password, name, role);

    return res.status(201).json({
      message: 'User created successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.authProvider) {
      return res.status(409).json({
        message: `This email is already registered with ${existingUser.authProvider}. Please login with ${existingUser.authProvider} instead.`,
        code: 'SOCIAL_LOGIN_REQUIRED',
      });
    }

    const user = await validateUser(email, password);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, tokenVersion: true, userType: true },
    });
    if (!dbUser) return res.status(500).json({ message: 'User not found' });

    const access = signAccessToken(user.id);
    const refresh = signRefreshToken(user.id, dbUser.tokenVersion);
    setAccessCookie(res, access);
    setRefreshCookie(res, refresh);

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const device = parseDevice(userAgent);
    const sessionRecord = await prisma.session.create({
      data: { userId: user.id, ipAddress: ip, userAgent, device, isActive: true },
    });
    res.cookie(SESSION_ID_COOKIE, sessionRecord.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});

    const appRole: 'customer' | 'tuner' | 'admin' = dbUser.userType === 'TUNER' ? 'tuner' : 'customer';

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: appRole,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const userId = req.userId!;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    if (req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      if (req.sessionId) {
        await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => {});
      }
    }
    const cookieOptions = {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: '/',
    } as const;
    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions);
    res.clearCookie(SESSION_ID_COOKIE, cookieOptions);
    return res.json({ message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.tokenVersion !== payload.tv) return res.status(401).json({ message: 'Token invalidated' });
    const access = signAccessToken(user.id);
    setAccessCookie(res, access);
    if (!req.cookies?.[SESSION_ID_COOKIE]) {
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] as string | undefined;
      const device = parseDevice(userAgent);
      const sessionRecord = await prisma.session.create({
        data: { userId: user.id, ipAddress: ip, userAgent, device, isActive: true },
      });
      res.cookie(SESSION_ID_COOKIE, sessionRecord.id, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    await prisma.session.updateMany({
      where: { userId: user.id, isActive: true },
      data: { lastActive: new Date() },
    });
    return res.json({ message: 'refreshed' });
  } catch (err) {
    return next(err);
  }
}

export async function profile(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const userId = req.userId!;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, userType: true },
    });
    if (!dbUser) return res.status(404).json({ message: 'User not found' });
    const appRole: 'customer' | 'tuner' | 'admin' = dbUser.userType === 'TUNER' ? 'tuner' : 'customer';
    return res.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: appRole,
      profileId: null,
      tunerProfile: null,
      customerProfile: null,
    });
  } catch (err) {
    return next(err);
  }
}



