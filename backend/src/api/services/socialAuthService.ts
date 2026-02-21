import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { resolveGoogleConfig, resolveGithubConfig } from '../config/socialProviders';

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  authProvider: true,
  userType: true,
  createdAt: true,
  tokenVersion: true,
} satisfies Prisma.UserSelect;

export type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export type PublicUser = Omit<SelectedUser, 'tokenVersion'>;

export class OAuthError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'OAuthError';
    this.status = status;
    this.code = code;
  }
}

type Provider = 'google' | 'github';

type SocialProfile = {
  provider: Provider;
  providerId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
};

export function getGoogleAuthorizationUrl() {
  const { clientId, redirectUri, scopes } = resolveGoogleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: 'google',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleCallback(code: string): Promise<SelectedUser> {
  const { clientId, clientSecret, redirectUri } = resolveGoogleConfig();

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenJson: any = await tokenResponse.json();
  if (!tokenResponse.ok || tokenJson.error) {
    const message =
      tokenJson.error_description || tokenJson.error || 'Google token exchange failed';
    throw new OAuthError(message, 400, 'TOKEN_EXCHANGE_FAILED');
  }

  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) {
    throw new OAuthError('Google did not return an access token', 400, 'TOKEN_MISSING');
  }

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const profileJson: any = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new OAuthError('Unable to fetch Google profile', 400, 'PROFILE_FETCH_FAILED');
  }

  const profile: SocialProfile = {
    provider: 'google',
    providerId: profileJson.sub,
    email: profileJson.email,
    name: profileJson.name,
    avatarUrl: profileJson.picture,
  };

  if (!profile.providerId) {
    throw new OAuthError('Google profile missing "sub" identifier', 400, 'PROFILE_INCOMPLETE');
  }

  return upsertUserFromProfile(profile);
}

export function getGithubAuthorizationUrl() {
  const { clientId, redirectUri, scopes } = resolveGithubConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state: 'github',
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function handleGithubCallback(code: string): Promise<SelectedUser> {
  const { clientId, clientSecret, redirectUri } = resolveGithubConfig();

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson: any = await tokenResponse.json();
  if (!tokenResponse.ok || tokenJson.error) {
    const message =
      tokenJson.error_description || tokenJson.error || 'GitHub token exchange failed';
    throw new OAuthError(message, 400, 'TOKEN_EXCHANGE_FAILED');
  }

  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) {
    throw new OAuthError('GitHub did not return an access token', 400, 'TOKEN_MISSING');
  }

  const profileHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'code-evolution-lab',
  };

  const userResponse = await fetch('https://api.github.com/user', {
    headers: profileHeaders,
  });

  const userJson: any = await userResponse.json();
  if (!userResponse.ok) {
    throw new OAuthError('Unable to fetch GitHub profile', 400, 'PROFILE_FETCH_FAILED');
  }

  const emailsResponse = await fetch('https://api.github.com/user/emails', {
    headers: profileHeaders,
  });

  let primaryEmail: string | undefined;
  if (emailsResponse.ok) {
    const emails = await emailsResponse.json() as any[];
    const primaryVerified = emails.find((email) => email.primary && email.verified);
    const anyVerified = emails.find((email) => email.verified);
    primaryEmail = primaryVerified?.email || anyVerified?.email;
  }

  const profile: SocialProfile = {
    provider: 'github',
    providerId: String(userJson.id),
    email: primaryEmail,
    name: userJson.name || userJson.login,
    avatarUrl: userJson.avatar_url,
  };

  if (!profile.providerId) {
    throw new OAuthError('GitHub profile missing "id" identifier', 400, 'PROFILE_INCOMPLETE');
  }

  if (!profile.email) {
    throw new OAuthError(
      'GitHub did not return an email address. Ensure your email is public or verified.',
      400,
      'EMAIL_REQUIRED'
    );
  }

  return upsertUserFromProfile(profile);
}

async function upsertUserFromProfile(profile: SocialProfile): Promise<SelectedUser> {
  console.log('[SocialAuth] Upserting user from profile:', { provider: profile.provider, email: profile.email });
  const providerField = profile.provider === 'google' ? 'googleId' : 'githubId';

  const existingByProvider = await prisma.user.findUnique({
    where: { [providerField]: profile.providerId } as any,
    select: userSelect,
  });

  if (existingByProvider) {
    console.log('[SocialAuth] Found existing user by provider ID:', existingByProvider.id);
    return updateUserFromProfile(existingByProvider.id, profile, existingByProvider);
  }

  if (profile.email) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: profile.email },
      select: userSelect,
    });

    if (existingByEmail) {
      console.log('[SocialAuth] Found existing user by email:', existingByEmail.id);
      return updateUserFromProfile(existingByEmail.id, profile, existingByEmail);
    }
  }

  if (!profile.email) {
    console.error('[SocialAuth] No email address returned by provider');
    throw new OAuthError(
      'No email address returned by provider. Cannot create account.',
      400,
      'EMAIL_REQUIRED'
    );
  }

  console.log('[SocialAuth] Creating new user for email:', profile.email);
  const newUser = await prisma.user.create({
    data: {
      email: profile.email,
      password: null,
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      authProvider: profile.provider,
      googleId: profile.provider === 'google' ? profile.providerId : null,
      githubId: profile.provider === 'github' ? profile.providerId : null,
    },
    select: userSelect,
  });
  console.log('[SocialAuth] New user created:', newUser.id);
  return newUser;
}

async function updateUserFromProfile(
  userId: string,
  profile: SocialProfile,
  existing: SelectedUser
): Promise<SelectedUser> {
  const data: Prisma.UserUpdateInput = {
    authProvider: profile.provider,
  };

  if (profile.name && profile.name !== existing.name) {
    data.name = profile.name;
  }

  if (profile.avatarUrl && profile.avatarUrl !== existing.avatarUrl) {
    data.avatarUrl = profile.avatarUrl;
  }

  if (profile.email && profile.email !== existing.email) {
    data.email = profile.email;
  }

  if (profile.provider === 'google') {
    data.googleId = profile.providerId;
  }

  if (profile.provider === 'github') {
    data.githubId = profile.providerId;
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: userSelect,
  });
}

export function redactUser(user: SelectedUser): PublicUser {
  const { tokenVersion, ...rest } = user;
  return rest;
}
