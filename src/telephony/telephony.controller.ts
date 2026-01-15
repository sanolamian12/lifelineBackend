import { Controller, Post, Header } from '@nestjs/common';
import { TelephonyService } from './telephony.service';

@Controller('telephony')
export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  // Twilio Webhook URL로 설정할 주소: https://your-domain.com/telephony/voice
  @Post('voice')
  @Header('Content-Type', 'text/xml') // Twilio는 XML 응답을 기대합니다
  async voiceWebhook() {
    return await this.telephonyService.handleIncomingCall();
  }
}

