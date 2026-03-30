import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialAccountType } from 'generated/prisma/client';
import {
  encryptFinancialAccountNumber,
  maskFinancialAccountNumber,
  normalizeAccountNumber,
} from '../common/utils/encryption.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFinancialAccountDto,
  UpdateFinancialAccountDto,
} from './dto/financial-account.dto';

const MAX_ACCOUNTS = 5;

const accountSelect = {
  id: true,
  type: true,
  provider: true,
  accountName: true,
  accountNumber: true,
  label: true,
  isActive: true,
  createdAt: true,
} as const;

type SelectedAccount = {
  id: string;
  type: FinancialAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
};

type AccountResponse = SelectedAccount & {
  isDefault: boolean;
};

function toAccountResponse(
  account: SelectedAccount,
  defaultFinancialAccountId: string | null,
): AccountResponse {
  return {
    ...account,
    isDefault: account.id === defaultFinancialAccountId,
    accountNumber: maskFinancialAccountNumber(account.accountNumber),
  };
}

@Injectable()
export class FinancialAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [user, accounts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultFinancialAccountId: true },
      }),
      this.prisma.financialAccount.findMany({
        where: { userId, isActive: true },
        select: accountSelect,
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const defaultFinancialAccountId = user?.defaultFinancialAccountId ?? null;

    return accounts
      .map((account) => toAccountResponse(account, defaultFinancialAccountId))
      .sort(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  async create(userId: string, dto: CreateFinancialAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isVerified: true, defaultFinancialAccountId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isVerified) {
      throw new BadRequestException(
        'Identity verification is required before adding payout accounts',
      );
    }

    const count = await this.prisma.financialAccount.count({
      where: { userId, isActive: true },
    });
    if (count >= MAX_ACCOUNTS) {
      throw new BadRequestException(
        `Maximum of ${MAX_ACCOUNTS} accounts allowed`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const { isDefault: shouldBeDefaultInput, ...accountData } = dto;
      const shouldBeDefault =
        shouldBeDefaultInput ?? !user.defaultFinancialAccountId;

      const createdAccount = await tx.financialAccount.create({
        data: {
          ...accountData,
          userId,
          accountNumber: encryptFinancialAccountNumber(
            normalizeAccountNumber(dto.accountNumber),
          ),
        },
        select: accountSelect,
      });

      if (shouldBeDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultFinancialAccountId: createdAccount.id },
        });
      }

      return toAccountResponse(
        createdAccount,
        shouldBeDefault ? createdAccount.id : user.defaultFinancialAccountId,
      );
    });
  }

  async update(
    userId: string,
    accountId: string,
    dto: UpdateFinancialAccountDto,
  ) {
    await this.findActiveOrThrow(userId, accountId);

    return this.prisma.$transaction(async (tx) => {
      const { isDefault, ...accountData } = dto;

      const updatedAccount = await tx.financialAccount.update({
        where: { id: accountId },
        data: accountData,
        select: accountSelect,
      });

      let defaultFinancialAccountId: string | null;

      if (isDefault) {
        const user = await tx.user.update({
          where: { id: userId },
          data: { defaultFinancialAccountId: accountId },
          select: { defaultFinancialAccountId: true },
        });
        defaultFinancialAccountId = user.defaultFinancialAccountId;
      } else {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { defaultFinancialAccountId: true },
        });
        defaultFinancialAccountId = user?.defaultFinancialAccountId ?? null;
      }

      return toAccountResponse(updatedAccount, defaultFinancialAccountId);
    });
  }

  async remove(userId: string, accountId: string) {
    await this.findActiveOrThrow(userId, accountId);

    const pendingWithdrawals = await this.prisma.withdrawal.count({
      where: {
        financialAccountId: accountId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (pendingWithdrawals > 0) {
      throw new BadRequestException(
        'Cannot remove account with pending withdrawals',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { defaultFinancialAccountId: true },
      });

      await tx.financialAccount.update({
        where: { id: accountId },
        data: { isActive: false },
      });

      if (user?.defaultFinancialAccountId !== accountId) {
        return;
      }

      const nextDefault = await tx.financialAccount.findFirst({
        where: {
          userId,
          isActive: true,
          id: { not: accountId },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: { defaultFinancialAccountId: nextDefault?.id ?? null },
      });
    });

    return { success: true };
  }

  private async findActiveOrThrow(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, userId, isActive: true },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Financial account not found');
    return account;
  }
}
