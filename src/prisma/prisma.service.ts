import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // 모듈이 시작될 때 DB 연결
  async onModuleInit() {
    await this.$connect();
  }

  // 모듈이 종료될 때 DB 연결 해제
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
