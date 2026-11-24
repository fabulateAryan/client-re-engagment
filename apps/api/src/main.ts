import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig, loadRootEnvFiles, REPO_ROOT } from './config';

async function bootstrap(): Promise<void> {
  loadRootEnvFiles(REPO_ROOT);

  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfig);

  app.enableCors({ origin: config.corsOrigin });
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger('Bootstrap').log(
    `API v${config.version} listening on http://localhost:${config.port}`,
  );
}

void bootstrap();
