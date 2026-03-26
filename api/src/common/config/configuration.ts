export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },

  refreshTtlDays: parseInt(process.env.REFRESH_TTL_DAYS ?? '30', 10),

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  },

  chapa: {
    secretKey: process.env.CHAPA_SECRET_KEY,
    baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co/v1',
    webhookSecret: process.env.CHAPA_WEBHOOK_SECRET,
  },
});
