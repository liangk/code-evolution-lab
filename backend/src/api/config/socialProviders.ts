type Provider = 'google' | 'github';

type BaseConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type GoogleConfig = BaseConfig;
export type GithubConfig = BaseConfig;

function ensure(value: string | undefined, key: string, provider: Provider): string {
  if (!value) {
    throw new Error(`Missing ${provider} OAuth configuration for ${key}`);
  }
  return value;
}

export function resolveGoogleConfig(): GoogleConfig {
  const scopes = (process.env.GOOGLE_OAUTH_SCOPES || 'openid email profile')
    .split(/[\s,]+/)
    .filter(Boolean);

  return {
    clientId: ensure(process.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID', 'google'),
    clientSecret: ensure(process.env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET', 'google'),
    redirectUri: ensure(process.env.GOOGLE_REDIRECT_URI, 'GOOGLE_REDIRECT_URI', 'google'),
    scopes,
  };
}

export function resolveGithubConfig(): GithubConfig {
  const scopes = (process.env.GITHUB_OAUTH_SCOPES || 'read:user user:email')
    .split(/[\s,]+/)
    .filter(Boolean);

  return {
    clientId: ensure(process.env.GITHUB_CLIENT_ID, 'GITHUB_CLIENT_ID', 'github'),
    clientSecret: ensure(process.env.GITHUB_CLIENT_SECRET, 'GITHUB_CLIENT_SECRET', 'github'),
    redirectUri: ensure(process.env.GITHUB_REDIRECT_URI, 'GITHUB_REDIRECT_URI', 'github'),
    scopes,
  };
}
