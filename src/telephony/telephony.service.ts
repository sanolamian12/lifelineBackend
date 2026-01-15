import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as twilio from 'twilio';

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(private prisma: PrismaService) {}

  async handleIncomingCall(): Promise<string> {
    const response = new twilio.twiml.VoiceResponse();

    try {
      const current = await this.prisma.current.findUnique({
        where: { id: 'singleton' },
      });

      if (!current || !current.cur_account) {
        response.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
          'No agent is currently active. Please try again later.');
        return response.toString();
      }

      const agent = await this.prisma.account.findUnique({
        where: { account_id: current.cur_account },
      });

      if (!agent || !agent.account_phone) {
        response.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 'Phone number not found.');
        return response.toString();
      }

      const dial = response.dial({ timeout: 25 });
      dial.number(agent.account_phone);

      response.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
        'The agent is unavailable. Please leave a message.');
      response.record({ maxLength: 60, playBeep: true });

      return response.toString();
    } catch (error) {
      this.logger.error('Twilio Call Error:', error);
      return response.toString();
    }
  }
}
