import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/utils/cookie.util';
import { assertCsrf } from '../common/utils/csrf.util';

function getAllowedOrigins(configService: ConfigService) {
  return configService
    .get<string>('corsOrigin', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function shouldSkipCsrfProtection(
  method: string,
  path: string,
  cookieHeader: string | undefined,
) {
  const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const hasSessionCookie =
    typeof cookieHeader === 'string' &&
    (cookieHeader.includes(`${ACCESS_COOKIE}=`) ||
      cookieHeader.includes(`${REFRESH_COOKIE}=`));
  const isExemptPath =
    path.includes('/supports/webhook') ||
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/register') ||
    path.endsWith('/auth/telegram') ||
    path.endsWith('/auth/forgot-password') ||
    path.endsWith('/auth/reset-password');

  return !isUnsafeMethod || !hasSessionCookie || isExemptPath;
}

function configureSwagger(app: INestApplication, port: number) {
  const logger = new Logger('Bootstrap');
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

export function configureApp(
  app: NestExpressApplication,
  configService: ConfigService,
) {
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const port = configService.get<number>('port', 3000);

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

  app.enableCors({
    origin: getAllowedOrigins(configService),
    credentials: true,
  });

  app.use((req, _res, next) => {
    const path = req.path ?? req.url ?? '';

    if (
      shouldSkipCsrfProtection(
        req.method.toUpperCase(),
        path,
        typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined,
      )
    ) {
      return next();
    }

    try {
      assertCsrf(req);
      return next();
    } catch (error) {
      return next(error);
    }
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (nodeEnv !== 'production') {
    configureSwagger(app, port);
  }

  return { nodeEnv, port };
}
