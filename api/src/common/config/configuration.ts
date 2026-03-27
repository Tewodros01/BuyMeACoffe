function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requireInProd(
  name: string,
  value: string | undefined,
): string | undefined {
  if (process.env.NODE_ENV === 'production' && !value?.trim()) {
    throw new Error(`Missing required env var in production: ${name}`);
  }
  return value;
}

export default () => {
  const jwtSecret = requireEnv('JWT_SECRET', process.env.JWT_SECRET);
  if (jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
    throw new Error('JWT_SECRET must not be the default placeholder value');
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    apiUrl: process.env.API_URL ?? 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

    jwt: {
      secret: jwtSecret,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },

    refreshTtlDays: parseInt(process.env.REFRESH_TTL_DAYS ?? '30', 10),
    security: {
      cookieDomain: process.env.COOKIE_DOMAIN,
      cookieSecure:
        (process.env.COOKIE_SECURE ?? '').toLowerCase() === 'true' ||
        process.env.NODE_ENV === 'production',
      cookieSameSite:
        process.env.COOKIE_SAME_SITE?.toLowerCase() === 'none'
          ? 'none'
          : process.env.COOKIE_SAME_SITE?.toLowerCase() === 'lax'
            ? 'lax'
            : 'strict',
    },
    financialAccounts: {
      encryptionKey: requireInProd(
        'FINANCIAL_ACCOUNT_ENCRYPTION_KEY',
        process.env.FINANCIAL_ACCOUNT_ENCRYPTION_KEY,
      ),
    },

    telegram: {
      botToken: requireInProd(
        'TELEGRAM_BOT_TOKEN',
        process.env.TELEGRAM_BOT_TOKEN,
      ),
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    },

    chapa: {
      secretKey: requireInProd(
        'CHAPA_SECRET_KEY',
        process.env.CHAPA_SECRET_KEY,
      ),
      baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co/v1',
      webhookSecret: requireInProd(
        'CHAPA_WEBHOOK_SECRET',
        process.env.CHAPA_WEBHOOK_SECRET,
      ),
    },
  };
};
