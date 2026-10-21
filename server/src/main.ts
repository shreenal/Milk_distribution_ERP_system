import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { NestExpressApplication } from '@nestjs/platform-express/interfaces/index.js';
import { performance } from 'node:perf_hooks';

async function bootstrap() {
  const totalStart = performance.now();

  const createStart = performance.now();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  console.log(
    `[startup] NestFactory.create: ${(performance.now() - createStart).toFixed(1)} ms`,
  );

  app.useBodyParser('json', { limit: '1mb' });
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.setGlobalPrefix('api');

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS environment variable is not set. Provide a comma-separated list of allowed origins.',
    );
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();

  const listenStart = performance.now();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(
    `[startup] app.listen: ${(performance.now() - listenStart).toFixed(1)} ms`,
  );
  console.log(
    `[startup] total bootstrap: ${(performance.now() - totalStart).toFixed(1)} ms`,
  );
}
void bootstrap();
