import { Request, Response, NextFunction } from 'express';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthError,
  getGoogleAuthorizationUrl,
  getGithubAuthorizationUrl,
} from '../services/socialAuthService';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_ID_COOKIE,
  IS_PROD,
} from '../utils/constants';
import prisma from '../prisma';
import { parseDevice, getClientIp } from '../utils/deviceParser';

export async function socialLogin(req: Request, res: Response, next: NextFunction): Promise<any> {
  console.log('[SocialAuth] Login request received:', { provider: req.body.provider });
  try {
    const { provider, code } = req.body as {
      provider: 'google' | 'github';
      code: string;
    };

    if (!provider || !code) {
      console.error('[SocialAuth] Missing provider or code');
      return res.status(400).json({ message: 'Provider and code are required' });
    }

    let user;
    try {
      if (provider === 'google') {
        user = await handleGoogleCallback(code);
      } else if (provider === 'github') {
        user = await handleGithubCallback(code);
      } else {
        console.error('[SocialAuth] Invalid provider:', provider);
        return res.status(400).json({ message: 'Invalid provider' });
      }
    } catch (err) {
      console.error('[SocialAuth] Callback handler failed:', err);
      if (err instanceof OAuthError) {
        return res.status(err.status).json({
          message: err.message,
          code: err.code,
        });
      }
      throw err;
    }

    console.log('[SocialAuth] User upserted successfully:', user.id);

    const access = signAccessToken(user.id);
    const refresh = signRefreshToken(user.id, user.tokenVersion);

    res.cookie(ACCESS_TOKEN_COOKIE, access, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie(REFRESH_TOKEN_COOKIE, refresh, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

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
        lastActive: new Date()
      },
    });
    res.cookie(SESSION_ID_COOKIE, sessionRecord.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    await prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => {});

    // Audit log for social login (optional - requires auditLog model)
    // await prisma.auditLog.create({ ... })

    const appRole: 'customer' | 'tuner' | 'admin' = user.userType === 'TUNER' ? 'tuner' : 'customer';

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        role: appRole,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function getGoogleAuthUrl(_req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const url = getGoogleAuthorizationUrl();
    return res.json({ url });
  } catch (err) {
    return next(err);
  }
}

export async function getGithubAuthUrl(_req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const url = getGithubAuthorizationUrl();
    return res.json({ url });
  } catch (err) {
    return next(err);
  }
}
