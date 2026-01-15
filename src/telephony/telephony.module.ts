// src/telephony/telephony.module.ts
import { Module } from '@nestjs/common';
import { TelephonyController } from './telephony.controller';
import { TelephonyService } from './telephony.service';
import { PrismaModule } from '../prisma/prisma.module'; // Prisma 연동을 위해 필요

@Module({
  imports: [PrismaModule], // DB 조회를 위해 PrismaModule을 가져옵니다.
  controllers: [TelephonyController],
  providers: [TelephonyService],
})
export class TelephonyModule {}

