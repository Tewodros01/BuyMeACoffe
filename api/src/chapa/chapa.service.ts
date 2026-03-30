import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface ChapaInitPayload {
  amount: number;
  currency: string;
  email: string;
  first_name: string;
  last_name: string;
  tx_ref: string;
  callback_url: string;
  return_url: string;
  customization?: { title?: string; description?: string };
}

export interface ChapaInitResponse {
  status: string;
  message: string;
  data: { checkout_url: string };
}

export interface ChapaVerifyResponse {
  status: string;
  message: string;
  data: {
    status: string;
    amount: number;
    currency: string;
    tx_ref: string;
    reference: string;
    created_at: string;
  };
}

interface ChapaErrorResponse {
  message?: string | Record<string, string[]>;
  status?: string;
  data?: unknown;
}

const CHAPA_TITLE_MAX_LENGTH = 16;
const CHAPA_DESCRIPTION_MAX_LENGTH = 120;
const CHAPA_ALLOWED_CUSTOMIZATION_TEXT = /[^A-Za-z0-9._\-\s]/g;

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private readonly http: AxiosInstance;
  private readonly webhookSecret: string | undefined;
  private readonly isProd: boolean;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('chapa.secretKey');
    const baseUrl =
      this.configService.get<string>('chapa.baseUrl') ??
      'https://api.chapa.co/v1';

    this.webhookSecret = this.configService.get<string>('chapa.webhookSecret');
    this.isProd = this.configService.get<string>('nodeEnv') === 'production';

    // Fail fast in production if critical config is missing
    if (this.isProd && !secretKey) {
      throw new InternalServerErrorException(
        'CHAPA_SECRET_KEY is required in production',
      );
    }
    if (this.isProd && !this.webhookSecret) {
      throw new InternalServerErrorException(
        'CHAPA_WEBHOOK_SECRET is required in production',
      );
    }

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  async initializePayment(
    payload: ChapaInitPayload,
  ): Promise<ChapaInitResponse> {
    try {
      const { data } = await this.http.post<ChapaInitResponse>(
        '/transaction/initialize',
        {
          ...payload,
          customization: this.sanitizeCustomization(payload.customization),
        },
      );
      return data;
    } catch (error: unknown) {
      const responseData = this.getAxiosErrorData(error);
      this.logger.error('Chapa init failed', responseData);
      throw new BadRequestException({
        message: this.formatChapaErrorMessage(
          responseData?.message,
          'Payment initialization failed',
        ),
        error: 'Bad Request',
        provider: 'CHAPA',
        details: responseData?.message ?? null,
      });
    }
  }

  async verifyPayment(txRef: string): Promise<ChapaVerifyResponse> {
    try {
      const { data } = await this.http.get<ChapaVerifyResponse>(
        `/transaction/verify/${txRef}`,
      );
      return data;
    } catch (error: unknown) {
      const responseData = this.getAxiosErrorData(error);
      this.logger.error('Chapa verify failed', responseData);
      throw new BadRequestException({
        message: this.formatChapaErrorMessage(
          responseData?.message,
          'Payment verification failed',
        ),
        error: 'Bad Request',
        provider: 'CHAPA',
        details: responseData?.message ?? null,
      });
    }
  }

  private getAxiosErrorData(error: unknown): ChapaErrorResponse | undefined {
    if (axios.isAxiosError<ChapaErrorResponse>(error)) {
      return error.response?.data;
    }

    return undefined;
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) {
      // In dev without a secret configured, log a warning and allow through
      // In prod this is already blocked in the constructor
      this.logger.warn(
        'CHAPA_WEBHOOK_SECRET not set — skipping signature verification (dev only)',
      );
      return true;
    }

    if (!signature) return false;

    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Both buffers must be same length for timingSafeEqual
    if (computed.length !== signature.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  }

  generateTxRef(prefix = 'bmac'): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  }

  private sanitizeCustomization(
    customization: ChapaInitPayload['customization'],
  ) {
    if (!customization) {
      return undefined;
    }

    const title = this.sanitizeCustomizationText(
      customization.title,
      CHAPA_TITLE_MAX_LENGTH,
      'Buy Me Coffee',
    );
    const description = this.sanitizeCustomizationText(
      customization.description,
      CHAPA_DESCRIPTION_MAX_LENGTH,
      undefined,
    );

    return {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    };
  }

  private sanitizeCustomizationText(
    value: string | undefined,
    maxLength: number,
    fallback: string | undefined,
  ) {
    const sanitized = value
      ?.replace(CHAPA_ALLOWED_CUSTOMIZATION_TEXT, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);

    return sanitized || fallback;
  }

  private formatChapaErrorMessage(
    message: ChapaErrorResponse['message'],
    fallback: string,
  ) {
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (message && typeof message === 'object') {
      const flattened = Object.entries(message).flatMap(([field, errors]) =>
        errors.map((entry) => `${field}: ${entry}`),
      );

      if (flattened.length > 0) {
        return flattened;
      }
    }

    return fallback;
  }
}
