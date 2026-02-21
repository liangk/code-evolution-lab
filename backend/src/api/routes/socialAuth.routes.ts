import { Router } from 'express';
import { body } from 'express-validator';
import {
  socialLogin,
  getGoogleAuthUrl,
  getGithubAuthUrl,
} from '../controllers/socialAuthController';
import { validateRequest } from '../middleware/validateRequest';
import { authRateLimiter } from '../middleware/authRateLimiter';

const router = Router();

router.get('/google', getGoogleAuthUrl);
router.get('/github', getGithubAuthUrl);

router.get('/callback', (req, res) => {
  const { code, state } = req.query;
  if (code && state) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8201';
    const redirectUrl = `${frontendUrl}/auth/callback?code=${encodeURIComponent(
      code as string
    )}&state=${encodeURIComponent(state as string)}`;
    res.redirect(redirectUrl);
  } else {
    res.status(400).json({ message: 'Missing code or state parameter' });
  }
});

router.post(
  '/callback',
  authRateLimiter,
  [
    body('provider').isIn(['google', 'github']).withMessage('Invalid provider'),
    body('code').isString().notEmpty().withMessage('Authorization code is required'),
  ],
  validateRequest,
  socialLogin
);

export default router;
