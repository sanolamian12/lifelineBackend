import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * [내부 헬퍼] 전화번호를 E.164 (+61...) 형식으로 변환
   */
  private formatToE164(phone: string): string {
    if (!phone) return phone;
    
    // 숫자만 남기기
    let cleaned = phone.replace(/\D/g, '');

    // 호주 번호가 0으로 시작하는 경우 (예: 0450620272 -> +61450620272)
    if (cleaned.startsWith('0')) {
      return `+61${cleaned.substring(1)}`;
    }
    
    // 국가번호 61로 시작하는데 +가 없는 경우
    if (cleaned.startsWith('61')) {
      return `+${cleaned}`;
    }

    // 이미 +가 붙어있는 경우는 그대로 반환, 없으면 최소한 +는 붙여줌
    return phone.startsWith('+') ? phone : `+${cleaned}`;
  }

  /**
   * [1.1] 로그인 (App/Web 공통)
   */
  async login(accountId: string, password: string) {

    console.log('--- [DEBUG] 로그인 시도 시작 ---');
    console.log(`ID: ${accountId}, PW: ${password ? '입력됨' : '입력 안 됨'}`);
    
    const auth = await this.prisma.auth.findUnique({
      where: { account_id: accountId },
      include: { account: true },
    });

    if (!auth) {
      throw new UnauthorizedException('존재하지 않는 계정입니다.');
    }
    // [추가] 계정 삭제(탈퇴) 여부 확인
    if (auth.account?.isDeleted) {
      throw new UnauthorizedException('삭제 처리된 ID입니다.');
    }

    const isPasswordMatching = await bcrypt.compare(password, auth.account_pw);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }

    if (!auth.account) {
      throw new NotFoundException('계정 상세 정보가 존재하지 않습니다.');
    }

    const payload = {
      sub: auth.account_id,
      username: auth.account.account_name,
      isChief: auth.account.isChief 
    };

    return {
      message: '로그인 성공!',
      access_token: this.jwtService.sign(payload),
      user: {
        id: auth.account_id,
        name: auth.account.account_name,
        phone: auth.account.account_phone,
        isChief: auth.account.isChief,
        joinedAt: auth.account.registeredAt || new Date()
      },
    };
  }

  /**
   * [1.3] 계정 생성 (Web 전용)
   */
  async createAccount(dto: { id: string; password: string; name: string; phone: string; isChief?: boolean }) {
    await this.checkDuplicateId(dto.id);

    const existingName = await this.prisma.account.findUnique({
      where: { account_name: dto.name },
    });
    if (existingName) {
      throw new ConflictException('이미 등록된 상담원 이름입니다.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    // Twilio 호환 번호 변환
    const formattedPhone = this.formatToE164(dto.phone);

    return await this.prisma.$transaction(async (tx) => {
      const auth = await tx.auth.create({
        data: {
          account_id: dto.id,
          account_pw: hashedPassword,
          account: {
            create: {
              account_name: dto.name,
              account_phone: formattedPhone, // 변환된 번호 저장
              isChief: dto.isChief || false,
            },
          },
        },
        include: { account: true },
      });

      return {
        message: '계정이 성공적으로 생성되었습니다.',
        user: {
          id: auth.account_id,
          name: auth.account?.account_name,
          phone: auth.account?.account_phone,
          isChief: auth.account?.isChief,
        },
      };
    });
  }

  /**
   * [1.6] 회원 정보 수정 (Web)
   */
  async updateAccountByAdmin(targetId: string, updateData: { name?: string; phone?: string; password?: string; isChief?: boolean; isDeleted?: boolean }) {

    let hashedPassword: string | undefined = undefined;
    if (updateData.password && updateData.password.trim() !== '') {
      hashedPassword = await bcrypt.hash(updateData.password, 10);
    }

    // 수정 시에도 전화번호가 포함되어 있다면 변환
    const formattedPhone = updateData.phone ? this.formatToE164(updateData.phone) : undefined;

    return await this.prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.account.update({
        where: { account_id: targetId },
        data: {
          account_name: updateData.name || undefined,
          account_phone: formattedPhone || undefined,
          isChief: updateData.isChief !== undefined ? updateData.isChief : undefined,
          isDeleted: updateData.isDeleted !== undefined ? updateData.isDeleted : undefined,
        },
      });

      if (hashedPassword) {
        await tx.auth.update({
          where: { account_id: targetId },
          data: { account_pw: hashedPassword },
        });
      }

      return {
        success: true,
        message: '상담원 정보가 성공적으로 수정되었습니다.',
        user: {
          id: updatedAccount.account_id,
          name: updatedAccount.account_name,
          phone: updatedAccount.account_phone,
          isChief: updatedAccount.isChief,
          isDeleted: updatedAccount.isDeleted,
          passwordChanged: !!hashedPassword,
        },
      };
    });
  }

  async checkDuplicateId(id: string) {
    const existing = await this.prisma.auth.findUnique({
      where: { account_id: id },
    });
    if (existing) {
      throw new BadRequestException('이미 사용 중인 아이디입니다.');
    }
    return { available: true };
  }

  /**
   * 내 전화번호 수정
   */
  async updateMyPhone(id: string, newPhone: string) {
    const formattedPhone = this.formatToE164(newPhone);
    return await this.prisma.account.update({
      where: { account_id: id },
      data: { account_phone: formattedPhone },
    });
  }
  /**
   * [1.7] 모든 상담원 목록 조회 (App/Web 공통)
   */
  async getAllAccounts() {
    return await this.prisma.account.findMany({
      select: {
        account_id: true,
        account_name: true,
        account_phone: true,
        isChief: true,
        isDeleted: true,
      },
      orderBy: {
        account_name: 'asc', // 이름 기준 가나다순 정렬
      },
    });
  }

  async deleteAccount(targetId: string) {
  // 1. 배정된 시간표가 있는지 확인
  const assignedOrders = await this.prisma.order.findMany({
    where: { account_id: targetId },
    select: { day: true, time: true }
  });

  // 2. 있다면 에러 메시지와 함께 차단
  if (assignedOrders.length > 0) {
    const info = assignedOrders.map(o => `${o.day}(${o.time})`).join(', ');
    throw new BadRequestException(
      `해당 상담원은 [${info}] 시간대에 배정되어 있습니다. 시간표를 먼저 수정하시어 이 상담원의 배정을 모두 해제하신 후 삭제를 진행해주시기 바랍니다.`
    );
  }

  // 3. 배정이 없을 때만 Auth, Account 삭제 (Transaction 사용 권장)
  return await this.prisma.$transaction(async (tx) => {
    await tx.account.delete({ where: { account_id: targetId } });
    await tx.auth.delete({ where: { account_id: targetId } });
      return { success: true, message: '상담원 계정이 삭제되었습니다.' };
    });
  }
  /**
   * [추가] 앱 사용자용 계정 삭제 요청 (소프트 삭제)
   */
  async requestWithdrawal(accountId: string) {
    // 1. 계정 존재 여부 확인
    const account = await this.prisma.account.findUnique({
      where: { account_id: accountId },
    });

    if (!account) {
      throw new NotFoundException('계정을 찾을 수 없습니다.');
    }

    // 2. 소프트 삭제 수행 (isDeleted 플래그만 true로 변경)
    return await this.prisma.account.update({
      where: { account_id: accountId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }
}
