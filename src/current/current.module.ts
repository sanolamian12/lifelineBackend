import { Module } from '@nestjs/common';
import { CurrentController } from './current.controller';
import { CurrentService } from './current.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module'; // 1. OrdersModule 임포트

@Module({
  imports: [
    PrismaModule, 
    OrdersModule // 2. 여기에 추가하여 CurrentService에서 OrdersService를 쓸 수 있게 함
  ],
  controllers: [CurrentController],
  providers: [CurrentService],
})
export class CurrentModule {}
