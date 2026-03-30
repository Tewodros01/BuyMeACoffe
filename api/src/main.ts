import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody is required for Chapa webhook signature verification
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const { port } = configureApp(app, configService);

  await app.listen(port);
  logger.log(`🚀 Running on: http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error('❌ Error starting server:', error);
  process.exit(1);
});
