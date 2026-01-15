import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module'; // PrismaModule 가져오기

@Module({
  imports: [PrismaModule], // 여기에 추가
  controllers: [OrdersController],
  providers: [OrdersService], // PrismaService는 PrismaModule에서 제공하므로 삭제 가능
  exports: [OrdersService],
})
export class OrdersModule {}
