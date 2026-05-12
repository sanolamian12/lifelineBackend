import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // 기존 경로 유지

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 1. 현재 시간 기준 Order 번호 조회 (앱 화면 강조용)
   * GET /orders/current-no
   */
  @Get('current-no')
  @UseGuards(JwtAuthGuard)
  async getCurrentNo(@Query('offset') offset: string) {
    const offsetMinutes = parseInt(offset) || 0;
    const orderNo = await this.ordersService.getCurrentOrderNo(offsetMinutes);
    return { currentOrderNo: orderNo };
  }
  /**
   * 2. 주간 시간표 벌크 업데이트 (관리자 웹 GUI용)
   * POST /orders/bulk-update
   * 바디 예시: [{ "account_id": "user_01", "day": "Monday", "time": "09 AM - 01 PM" }, ...]
   */
  @Post('bulk-update')
  @UseGuards(JwtAuthGuard)
  async bulkUpdate(@Body() newScheduleData: any[], @Query('offset') offset?: string) {
    const offsetMinutes = offset ? parseInt(offset) : 0;
    return await this.ordersService.updateWeeklySchedule(newScheduleData, offsetMinutes);
  }
  /**
   * 3. 주간 전체 스케줄 목록 조회
   * GET /orders/all
   */
  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getAllOrders() {
    return await this.ordersService.getAllOrders();
  }

  @Get('last-updated')
  @UseGuards(JwtAuthGuard)
  async getLastUpdated() {
    const date = await this.ordersService.getScheduleMetadata();
    return { lastUpdated: date };
  }
  
  @Post('restore')
  @UseGuards(JwtAuthGuard)
  async restore(@Query('offset') offset?: string) {
    const offsetMinutes = offset ? parseInt(offset) : 0;
    return await this.ordersService.restoreSchedule(offsetMinutes);
  }
}
