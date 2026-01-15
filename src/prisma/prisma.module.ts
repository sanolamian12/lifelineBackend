import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // 전역으로 설정하여 어디서든 쉽게 import 가능하게 합니다.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
