import * as crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1';
const IV_LENGTH = 12;

function getKeyMaterial(): Buffer {
  const configured = process.env.FINANCIAL_ACCOUNT_ENCRYPTION_KEY?.trim();

  if (configured) {
    if (/^[A-Fa-f0-9]{64}$/.test(configured)) {
      return Buffer.from(configured, 'hex');
    }

    return crypto.createHash('sha256').update(configured).digest();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FINANCIAL_ACCOUNT_ENCRYPTION_KEY is required in production',
    );
  }

  return crypto
    .createHash('sha256')
    .update(process.env.JWT_SECRET ?? 'dev-only-financial-account-key')
    .digest();
}

function getKey() {
  const key = getKeyMaterial();
  if (key.length !== 32) {
    throw new Error('Financial account encryption key must resolve to 32 bytes');
  }
  return key;
}

export function normalizeAccountNumber(value: string) {
  return value.replace(/\s+/g, '').trim();
}

export function encryptFinancialAccountNumber(value: string) {
  const normalized = normalizeAccountNumber(value);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptFinancialAccountNumber(value: string) {
  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return normalizeAccountNumber(value);
  }

  const [, , ivB64, tagB64, encryptedB64] = value.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);

  return normalizeAccountNumber(decrypted.toString('utf8'));
}

export function maskFinancialAccountNumber(value: string) {
  const accountNumber = decryptFinancialAccountNumber(value);
  return accountNumber.length > 4
    ? `${'*'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`
    : '****';
}

export function financialAccountLast4(value: string) {
  const accountNumber = decryptFinancialAccountNumber(value);
  return accountNumber.slice(-4);
}
