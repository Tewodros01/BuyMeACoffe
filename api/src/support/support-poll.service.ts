import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import type { PaymentSupport } from './support-payment.service';

@Injectable()
export class SupportPollService {
  async recordPaidVote(
    tx: Prisma.TransactionClient,
    support: PaymentSupport,
  ) {
    if (!support.pollId || !support.pollOptionId || !support.supporterId) {
      return;
    }

    const voteExists = await tx.paidVote.findFirst({
      where: {
        supportId: support.id,
      },
      select: { id: true },
    });

    if (voteExists) {
      throw new ConflictException('This paid vote has already been recorded');
    }

    await tx.pollOption.update({
      where: { id: support.pollOptionId },
      data: {
        votes: { increment: 1 },
      },
    });

    await tx.paidVote.create({
      data: {
        pollId: support.pollId,
        optionId: support.pollOptionId,
        userId: support.supporterId,
        supportId: support.id,
      },
    });
  }
}
