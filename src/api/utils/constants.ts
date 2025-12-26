export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const SESSION_ID_COOKIE = 'session_id';
export const TWOFA_COOKIE = '2fa_token';

export const IS_PROD = process.env.NODE_ENV === 'production';
export const SKIP_EMAIL_VERIFICATION = process.env.SKIP_EMAIL_VERIFICATION === 'true';
