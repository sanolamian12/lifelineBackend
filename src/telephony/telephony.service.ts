import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // PrismaService 경로 확인 필요

@Injectable()
export class TelephonyService {
  constructor(private prisma: PrismaService) {}

  /**
   * DB에서 현재 상담원(cur_account)의 전화번호를 찾아 반환합니다.
   */
  async getCurrentCounselorPhone() {
    // 1. Current 테이블(Singleton)에서 현재 상담원 ID 조회
    const currentStatus = await this.prisma.current.findUnique({
      where: { id: 'singleton' },
    });

    if (!currentStatus) {
      throw new NotFoundException('현재 상담원 설정(Current) 정보를 찾을 수 없습니다.');
    }

    // 2. 해당 ID를 가진 Account의 전화번호 조회
    const account = await this.prisma.account.findUnique({
      where: { account_id: currentStatus.cur_account },
    });

    if (!account) {
      throw new NotFoundException(`상담원 ID ${currentStatus.cur_account}에 해당하는 계정 정보가 없습니다.`);
    }

    // 3. Amazon Connect Lambda가 인식하기 쉬운 형태의 JSON 반환
    // E.164 규격(+61...)으로 DB에 저장되어 있어야 합니다.
    return {
      destinationNumber: account.account_phone,
      accountName: account.account_name, // 확인용 (선택 사항)
    };
  }
}
