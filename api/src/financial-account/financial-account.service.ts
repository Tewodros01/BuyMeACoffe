import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  accountNumber: true, // masked before returning — see maskAccount()
  label: true,
  isDefault: true,
  isActive: true,
  createdAt: true,
} as const;

function maskAccount(account: { accountNumber: string; [key: string]: unknown }) {
  const n = account.accountNumber;
  return {
    ...account,
    accountNumber: n.length > 4 ? `${'*'.repeat(n.length - 4)}${n.slice(-4)}` : '****',
  };
}

@Injectable()
export class FinancialAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { userId, isActive: true },
      select: accountSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return accounts.map(maskAccount);
  }

  async create(userId: string, dto: CreateFinancialAccountDto) {
    const count = await this.prisma.financialAccount.count({
      where: { userId, isActive: true },
    });
    if (count >= MAX_ACCOUNTS) {
      throw new BadRequestException(`Maximum of ${MAX_ACCOUNTS} accounts allowed`);
    }

    return this.prisma.$transaction(async (tx) => {
      // If this is set as default, unset all others first
      if (dto.isDefault) {
        await tx.financialAccount.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // First account is always default
      const isDefault = dto.isDefault ?? count === 0;

      return maskAccount(
        await tx.financialAccount.create({
          data: { ...dto, userId, isDefault },
          select: accountSelect,
        }),
      );
    });
  }

  async update(userId: string, accountId: string, dto: UpdateFinancialAccountDto) {
    await this.findActiveOrThrow(userId, accountId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.financialAccount.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return maskAccount(
        await tx.financialAccount.update({
          where: { id: accountId },
          data: dto,
          select: accountSelect,
        }),
      );
    });
  }

  async remove(userId: string, accountId: string) {
    await this.findActiveOrThrow(userId, accountId);

    // Block deletion if there are pending/processing withdrawals on this account
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

    // Soft delete — preserve history for completed withdrawals
    await this.prisma.financialAccount.update({
      where: { id: accountId },
      data: { isActive: false, isDefault: false },
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
