import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, WithdrawalStatus } from 'generated/prisma/client';

const WITHDRAWAL_TRANSITIONS: Record<
  WithdrawalStatus,
  Exclude<WithdrawalStatus, 'PENDING'>[]
> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};

@Injectable()
export class WithdrawalTransitionService {
  assertTransition(current: WithdrawalStatus, next: WithdrawalStatus) {
    if (!WITHDRAWAL_TRANSITIONS[current]?.includes(next as never)) {
      throw new ConflictException(
        `Invalid withdrawal transition from ${current} to ${next}`,
      );
    }
  }

  async moveToProcessing(
    tx: Prisma.TransactionClient,
    input: {
      withdrawalId: string;
      adminNote?: string;
      referenceId?: string;
      at: Date;
    },
  ) {
    return tx.withdrawal.updateMany({
      where: {
        id: input.withdrawalId,
        status: 'PENDING',
        processingStartedAt: null,
        processedAt: null,
      },
      data: {
        status: 'PROCESSING',
        adminNote: input.adminNote,
        referenceId: input.referenceId,
        processingStartedAt: input.at,
      },
    });
  }

  async finalize(
    tx: Prisma.TransactionClient,
    input: {
      withdrawalId: string;
      status: 'COMPLETED' | 'REJECTED';
      adminNote?: string;
      referenceId?: string;
      at: Date;
    },
  ) {
    return tx.withdrawal.updateMany({
      where: {
        id: input.withdrawalId,
        status: 'PROCESSING',
        processingStartedAt: { not: null },
        processedAt: null,
      },
      data: {
        status: input.status,
        adminNote: input.adminNote,
        referenceId: input.referenceId,
        approvedAt: input.status === 'COMPLETED' ? input.at : undefined,
        rejectedAt: input.status === 'REJECTED' ? input.at : undefined,
        processedAt: input.at,
      },
    });
  }
}
