import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CurrentModule } from './current/current.module';
import { TelephonyModule } from './telephony/telephony.module'; // 1. 추가

@Module({
  imports: [
    PrismaModule, 
    AuthModule, 
    CurrentModule, 
    TelephonyModule // 2. 추가
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

