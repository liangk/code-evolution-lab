import { Router } from 'express';
import { db } from '../database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const sessions = await db.getSessionsByUser(req.user!.id);
    
    const sessionsWithDeviceInfo = sessions.map(session => {
      const userAgent = session.userAgent || '';
      const deviceInfo = parseUserAgent(userAgent);
      
      return {
        id: session.id,
        device: deviceInfo.device,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ipAddress: session.ipAddress || 'Unknown',
        location: session.location || 'Unknown',
        lastActive: session.lastActive,
        createdAt: session.createdAt,
        isActive: session.isActive,
        isCurrent: session.id === req.sessionId
      };
    });

    res.json({ success: true, sessions: sessionsWithDeviceInfo });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to retrieve sessions', message: (error as Error).message });
  }
});

router.post('/:sessionId/revoke', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    const session = await db.getSession(sessionId, req.user!.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.id === req.sessionId) {
      res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
      return;
    }

    await db.revokeSession(sessionId, req.user!.id);

    res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session', message: (error as Error).message });
  }
});

router.post('/revoke-all-others', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    if (!req.sessionId) {
      res.status(400).json({ error: 'No current session found' });
      return;
    }

    await db.revokeAllOtherSessions(req.sessionId, req.user!.id);

    res.json({ success: true, message: 'All other sessions revoked successfully' });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions', message: (error as Error).message });
  }
});

function parseUserAgent(userAgent: string): { device: string; browser: string; os: string } {
  const ua = userAgent.toLowerCase();
  
  let device = 'Desktop';
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    device = /tablet|ipad/i.test(ua) ? 'Tablet' : 'Mobile';
  }

  let browser = 'Unknown';
  if (/chrome|crios/i.test(ua) && !/edge|opr/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edge/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';

  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os|macos/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/ios|iphone|ipad|ipod/i.test(ua)) os = 'iOS';

  return { device, browser, os };
}

export default router;
