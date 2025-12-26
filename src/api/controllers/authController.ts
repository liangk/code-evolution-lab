import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { createUser, getUserById, validateUser } from '../services/authService';
import {
  signAccessToken,
  signRefreshToken,
  signEmailVerificationToken,
  verifyRefreshToken,
  verifyEmailVerificationToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  signTwoFAToken,
} from '../utils/jwt';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  IS_PROD,
  SKIP_EMAIL_VERIFICATION,
  SESSION_ID_COOKIE,
  TWOFA_COOKIE,
} from '../utils/constants';
import prisma from '../prisma';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailService';
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

export async function register(req: Request, res: Response, next: any) {
  try {
    const { email, password, name, role, captchaToken } = req.body as {
      email: string;
      password: string;
      name?: string;
      role: 'customer' | 'tuner';
      captchaToken?: string;
    };

    // Captcha required for registration
    const ipForCaptcha =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const captchaOk = await verifyTurnstile(captchaToken, ipForCaptcha);
    if (!captchaOk) return res.status(400).json({ message: 'Captcha verification failed' });

    // First check if user exists and has social login
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

    if (!SKIP_EMAIL_VERIFICATION) {
      // Send verification email
      const verificationToken = signEmailVerificationToken(user.id);
      await sendVerificationEmail(email, verificationToken);
    } else {
      // Mark email as verified if skipping verification
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    res.status(201).json({
      message: SKIP_EMAIL_VERIFICATION
        ? 'User created successfully.'
        : 'User created successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: SKIP_EMAIL_VERIFICATION,
      },
      requiresVerification: !SKIP_EMAIL_VERIFICATION,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: any) {
  try {
    const { email, password, captchaToken } = req.body as {
      email: string;
      password: string;
      captchaToken?: string;
    };

    // First check if user exists and has social login
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.authProvider) {
      return res.status(409).json({
        message: `This email is already registered with ${existingUser.authProvider}. Please login with ${existingUser.authProvider} instead.`,
        code: 'SOCIAL_LOGIN_REQUIRED',
      });
    }

    // Lockout check
    const now = new Date();
    if (existingUser?.lockedUntil && existingUser.lockedUntil > now) {
      return res
        .status(429)
        .json({ message: 'Too many attempts. Account temporarily locked. Try again later.' });
    }

    // Determine if captcha is required
    const captchaThreshold = parseInt(process.env.AUTH_LOGIN_CAPTCHA_THRESHOLD || '3', 10);
    const needCaptcha = (existingUser?.failedLogins ?? 0) >= captchaThreshold;
    if (needCaptcha) {
      const ipForCaptcha =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const ok = await verifyTurnstile(captchaToken, ipForCaptcha);
      if (!ok) return res.status(400).json({ message: 'Captcha required' });
    }

    const user = await validateUser(email, password);
    if (!user) {
      // Audit: login failure
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const userAgent = (req.headers['user-agent'] as string) || undefined;
      await prisma.auditLog
        .create({
          data: {
            userId: existingUser?.id,
            action: 'LOGIN_FAILURE',
            ipAddress: ip,
            userAgent,
            metadata: { email },
          },
        })
        .catch(() => {
          /* non-blocking */
        });

      // Increment failed attempts and possibly lock
      if (existingUser) {
        const nextFails = (existingUser.failedLogins ?? 0) + 1;
        const lockAfter = parseInt(process.env.AUTH_LOGIN_LOCK_AFTER || '10', 10);
        const lockMinutes = parseInt(process.env.AUTH_LOGIN_LOCK_MINUTES || '10', 10);
        const data: any = { failedLogins: nextFails };
        if (nextFails >= lockAfter) {
          data.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
        }
        await prisma.user.update({ where: { id: existingUser.id }, data }).catch(() => {});
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        emailVerified: true,
        tokenVersion: true,
        twoFactorEnabled: true,
        userType: true,
        globalRole: {
          select: { name: true },
        },
      },
    });
    if (!dbUser) return res.status(500).json({ message: 'User not found' });

    // Check if email is verified (skip if flag is true)
    if (!SKIP_EMAIL_VERIFICATION && !dbUser.emailVerified) {
      return res.status(403).json({
        message:
          'Please verify your email before logging in or check your email for a verification link.',
        requiresVerification: true,
      });
    }

    // If user enabled 2FA, do not log in yet. Issue a temporary 2FA cookie and ask for code.
    if (dbUser.twoFactorEnabled) {
      const nonce = randomUUID();
      const twofaToken = signTwoFAToken(user.id, nonce);
      res.cookie(TWOFA_COOKIE, twofaToken, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        maxAge: 5 * 60 * 1000,
        path: '/',
      });
      return res.json({ requires2FA: true });
    }

    const access = signAccessToken(user.id);
    const refresh = signRefreshToken(user.id, dbUser.tokenVersion);
    setAccessCookie(res, access);
    setRefreshCookie(res, refresh);
    // Record current session for session management
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const device = parseDevice(userAgent);
    const sessionRecord = await prisma.session.create({
      data: {
        userId: user.id,
        ipAddress: ip,
        userAgent,
        device,
        isActive: true,
      },
    });
    res.cookie(SESSION_ID_COOKIE, sessionRecord.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    // Reset failed attempts on success and record last login
    await prisma.user
      .update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      })
      .catch(() => {});
    // Audit: login success
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: 'LOGIN_SUCCESS',
          ipAddress: ip,
          userAgent: userAgent as string | undefined,
          metadata: { sessionId: sessionRecord.id },
        },
      })
      .catch(() => {
        /* non-blocking */
      });

    const appRole: 'customer' | 'tuner' | 'admin' =
      dbUser.globalRole?.name === 'Admin'
        ? 'admin'
        : dbUser.userType === 'TUNER'
        ? 'tuner'
        : 'customer';

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: dbUser.emailVerified,
        role: appRole,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: any) {
  try {
    // Invalidate refresh tokens by bumping tokenVersion
    if (req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      // Delete the current session from DB
      if (req.sessionId) {
        await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => {
          // Ignore if session not found (idempotent)
        });
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
    res.clearCookie(TWOFA_COOKIE, cookieOptions);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: any) {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const cookieOptions = {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: '/',
    } as const;
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.tokenVersion !== payload.tv)
      return res.status(401).json({ message: 'Token invalidated' });
    const access = signAccessToken(user.id);
    setAccessCookie(res, access);
    if (!req.cookies?.[SESSION_ID_COOKIE]) {
      // create a lightweight session record if none exists
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] as string | undefined;
      const device = parseDevice(userAgent);
      const sessionRecord = await prisma.session.create({
        data: {
          userId: user.id,
          ipAddress: ip,
          userAgent,
          device,
          isActive: true,
        },
      });
      res.cookie(SESSION_ID_COOKIE, sessionRecord.id, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    // Touch a session record's lastActive if exists
    await prisma.session.updateMany({
      where: { userId: user.id, isActive: true },
      data: { lastActive: new Date() },
    });
    // Audit: token refresh
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: 'TOKEN_REFRESH',
          ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
          userAgent: (req.headers['user-agent'] as string) || undefined,
        },
      })
      .catch(() => {
        /* non-blocking */
      });
    res.json({ message: 'refreshed' });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: any) {
  try {
    const { token } = req.query as { token: string };
    if (!token) return res.status(400).json({ message: 'Verification token is required' });

    const payload = verifyEmailVerificationToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid token type') {
      return res.status(400).json({ message: 'Invalid verification token' });
    }
    next(err);
  }
}

export async function resendVerificationEmail(req: Request, res: Response, next: any) {
  try {
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

    const verificationToken = signEmailVerificationToken(user.id);
    await sendVerificationEmail(email, verificationToken);

    res.json({ message: 'Verification email sent successfully' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: any) {
  try {
    const { token, password } = req.body as { token: string; password: string };
    if (!token || !password)
      return res.status(400).json({ message: 'Token and password are required' });

    const payload = verifyPasswordResetToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Hash the new password
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and increment token version to invalidate all existing tokens
    // Also mark email as verified since user proved ownership through reset process
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        tokenVersion: { increment: 1 },
        emailVerified: true, // Mark email as verified after successful password reset
      },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid token type') {
      return res.status(400).json({ message: 'Invalid reset token' });
    }
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: any) {
  try {
    const { email, captchaToken } = req.body as { email: string; captchaToken?: string };
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // Captcha required
    const ipForCaptcha =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const captchaOk = await verifyTurnstile(captchaToken, ipForCaptcha);
    if (!captchaOk) return res.status(400).json({ message: 'Captcha verification failed' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        message: 'If an account with this email exists, a password reset link has been sent.',
      });
    }

    const resetToken = signPasswordResetToken(user.id);
    await sendPasswordResetEmail(email, resetToken);

    res.json({
      message: 'If an account with this email exists, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

export async function profile(req: Request, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        userType: true,
        globalRole: {
          select: { name: true },
        },
      },
    });
    
    if (!dbUser) return res.status(404).json({ message: 'User not found' });

    // Get the related profile with full data
    let profileId = null;
    let tunerProfile = null;
    let customerProfile = null;
    
    if (dbUser.userType === 'TUNER') {
      const profile = await prisma.tunerProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          businessName: true,
          businessAddress: true,
          businessLatitude: true,
          businessLongitude: true,
          serviceRadius: true,
          servicePostcodes: true,
        },
      });
      profileId = profile?.id;
      tunerProfile = profile;
    } else if (dbUser.userType === 'CUSTOMER') {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      profileId = profile?.id;
      customerProfile = profile;
    }

    const appRole: 'customer' | 'tuner' | 'admin' =
      dbUser.globalRole?.name === 'Admin'
        ? 'admin'
        : dbUser.userType === 'TUNER'
        ? 'tuner'
        : 'customer';

    res.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      emailVerified: dbUser.emailVerified,
      role: appRole,
      profileId: profileId,
      tunerProfile: tunerProfile,
      customerProfile: customerProfile,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const { name, email } = req.body as { name?: string; email?: string };

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    // Check if email is being changed and if it's already taken
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) return res.status(409).json({ message: 'Email is already taken' });
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(email &&
          email !== existingUser.email && {
            email,
            emailVerified: false, // Reset email verification if email changed
          }),
      },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    // If email was changed, send verification email
    if (email && email !== existingUser.email && !SKIP_EMAIL_VERIFICATION) {
      const verificationToken = signEmailVerificationToken(userId);
      await sendVerificationEmail(email, verificationToken);
    }

    res.json({
      message:
        email && email !== existingUser.email && !SKIP_EMAIL_VERIFICATION
          ? 'Profile updated successfully. Please verify your new email address.'
          : 'Profile updated successfully.',
      ...updatedUser,
      requiresVerification: email && email !== existingUser.email && !SKIP_EMAIL_VERIFICATION,
    });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    const user = await getUserById(userId, true);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password || '');
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}
