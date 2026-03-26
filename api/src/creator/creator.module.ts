import { Module } from '@nestjs/common';
import { CreatorController } from './creator.controller';
import { CreatorService } from './creator.service';

@Module({
  controllers: [CreatorController],
  providers: [CreatorService],
  exports: [CreatorService],
})
export class CreatorModule {}
