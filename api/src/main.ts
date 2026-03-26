import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody is required for Chapa webhook signature verification
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const port = configService.get<number>('port', 3000);

  // Security headers — must be before routes
  app.use(helmet());

  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/public' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigin = configService.get<string>('corsOrigin', 'http://localhost:5173');
  const allowedOrigins = corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Buy Me a Coffee Ethiopia — API')
      .setDescription('Backend API for the Ethiopian Buy Me a Coffee platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.log(`📚 API Documentation: http://localhost:${port}/docs`);
  }

  await app.listen(port);
  logger.log(`🚀 Running on: http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error('❌ Error starting server:', error);
  process.exit(1);
});
