export interface EnvironmentVariables {
  PORT: number;
  CORS_ORIGIN: string;
  PUBLIC_API_URL: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  TELEGRAM_BOT_TOKEN: string;
}

function requireEnv(name: string, value?: string) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  publicApiUrl:
    process.env.PUBLIC_API_URL ||
    `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,
  database: {
    url: requireEnv('DATABASE_URL', process.env.DATABASE_URL),
  },
  jwt: {
    secret: (() => {
      const secret = requireEnv('JWT_SECRET', process.env.JWT_SECRET);
      if (secret === 'your-secret-key') {
        throw new Error(
          'JWT_SECRET must be set to a secure, non-default production secret',
        );
      }
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  telegram: {
    botToken:
      process.env.NODE_ENV === 'production'
        ? requireEnv('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)
        : process.env.TELEGRAM_BOT_TOKEN,
  },
});
