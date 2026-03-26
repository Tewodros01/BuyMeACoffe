import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

export const IMAGE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const PROOF_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  'application/pdf',
] as const;

export function validateUploadMimeType(
  mimeType: string | undefined,
  allowedMimeTypes: readonly string[],
  errorMessage: string,
) {
  if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
    throw new BadRequestException(errorMessage);
  }
}

export function storeUploadedFile(params: {
  file: Express.Multer.File | undefined;
  subdirectory: string;
  allowedMimeTypes: readonly string[];
  fallbackExtension: string;
  filenamePrefix?: string;
  errorMessage: string;
}) {
  const {
    file,
    subdirectory,
    allowedMimeTypes,
    fallbackExtension,
    filenamePrefix,
    errorMessage,
  } = params;

  if (!file) {
    throw new BadRequestException('No file provided');
  }

  validateUploadMimeType(file.mimetype, allowedMimeTypes, errorMessage);

  const uploadsDir = path.join(process.cwd(), 'public', subdirectory);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const extension = MIME_EXTENSION_MAP[file.mimetype] ?? fallbackExtension;
  const prefix = filenamePrefix ? `${filenamePrefix}-` : '';
  const filename = `${prefix}${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);

  return `/${path.posix.join('public', subdirectory, filename)}`;
}
