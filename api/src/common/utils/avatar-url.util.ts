import { ConfigService } from '@nestjs/config';

export function getPublicApiUrl(configService: ConfigService): string {
  return configService.get<string>('apiUrl') ?? 'http://localhost:3000';
}

export function toPublicAssetUrl(
  path: string | null | undefined,
  apiUrl: string,
): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${apiUrl}/${path.replace(/^\//, '')}`;
}
