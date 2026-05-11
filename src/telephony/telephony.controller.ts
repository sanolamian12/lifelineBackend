import { Controller, Get, UseGuards } from '@nestjs/common';
import { TelephonyService } from './telephony.service';

@Controller('telephony')
export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  /**
   * [Amazon Connect용] 현재 착신 전환 대상 번호 조회
   * AWS Lambda에서 이 엔드포인트를 호출하여 현재 상담원의 번호를 가져갑니다.
   * GET /telephony/current-forwarding-number
   */
  @Get('current-forwarding-number')
  async getCurrentNumber() {
    return await this.telephonyService.getCurrentCounselorPhone();
  }
}
