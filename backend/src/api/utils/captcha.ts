export async function verifyTurnstile(
  token: string | undefined,
  ip: string | undefined
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping captcha verification');
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: ip,
      }),
    });

    const data = await response.json() as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
