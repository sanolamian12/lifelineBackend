import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CurrentService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  /**
   * [내부 헬퍼] 활동 내역 기록 및 누적 시간 업데이트
   */
  private async recordActivity(tx: any, accountId: string, flag: 'start' | 'end') {
    const now = new Date();

    if (flag === 'end') {
      const lastActivity = await tx.activity.findFirst({
        where: { account_id: accountId, end_time: null },
        orderBy: { start_time: 'desc' },
      });

      if (lastActivity) {
        const diffMs = now.getTime() - lastActivity.start_time.getTime();
        const diffHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        await tx.activity.update({
          where: { id: lastActivity.id },
          data: { end_time: now, hours: diffHours },
        });

        await tx.account.update({
          where: { account_id: accountId },
          data: { total_hours: { increment: diffHours } }
        });
      }
    } else {
      // 이미 시작된 기록이 있는지 확인 (중복 시작 방지)
      const active = await tx.activity.findFirst({
        where: { account_id: accountId, end_time: null }
      });
      if (!active) {
        await tx.activity.create({
          data: {
            account_id: accountId,
            start_time: now,
          },
        });
      }
    }
  }

  // 테스트용 래퍼
  async testRecordWrapper(accountId: string, flag: 'start' | 'end') {
    return await this.prisma.$transaction(async (tx) => {
      return await this.recordActivity(tx, accountId, flag);
    });
  }

  /**
   * [1.5] 활동 내역 조회
   */
  async getMyActivities(accountId: string) {
    const [account, activities] = await Promise.all([
      this.prisma.account.findUnique({
        where: { account_id: accountId },
        select: { total_hours: true }
      }),
      this.prisma.activity.findMany({
        where: { account_id: accountId },
        orderBy: { start_time: 'desc' },
        take: 50,
      })
    ]);

    if (!account) throw new NotFoundException('계정을 찾을 수 없습니다.');

    return {
      userId: accountId,
      totalHours: account.total_hours ? parseFloat(Number(account.total_hours).toFixed(2)) : 0,
      historyCount: activities.length,
      history: activities.map(act => ({
        id: act.id,
        date: act.start_time.toISOString().split('T')[0],
        start: act.start_time,
        end: act.end_time,
        duration: act.hours ? `${act.hours}시간` : '진행 중',
      }))
    };
  }

  /**
   * [2.0] 화면에 필요한 모든 정보 조회
   */
  async getHandoverStatus(loginUserId: string) {
    const current = await this.prisma.current.findUnique({
      where: { id: 'singleton' },
    });

    if (!current) throw new NotFoundException('Current 데이터가 없습니다.');
    
    const [curUser, nextUser, selectedUser, curOrder, nextOrder, selectedOrder] = await Promise.all([
      this.prisma.account.findUnique({ where: { account_id: current.cur_account } }),
      this.prisma.account.findUnique({ where: { account_id: current.next_account } }),
      this.prisma.account.findUnique({ where: { account_id: current.selected_account } }),
      // 현재 상담원의 시간표 정보 조회
      this.prisma.order.findFirst({ where: { account_id: current.cur_account } }),
      this.prisma.order.findFirst({ where: { account_id: current.next_account} }),
      // 선택된(다음) 상담원의 시간표 정보 조회
      this.prisma.order.findFirst({ where: { account_id: current.selected_account } }),
    ]);

    return {
      isAdminMode: current.isAdminMode,
      currentCounselor: {
        id: curUser?.account_id || null,
        name: curUser?.account_name || '미지정',
        phone: curUser?.account_phone || '',
        time: curOrder?.time || '시간 정보 없음', // 추가: "오전 9시 - 오후 1시"
        isMe: current.cur_account === loginUserId,
      },
      nextCounselor: {
        id: nextUser?.account_id || null,
        name: nextUser?.account_name || '미지정',
        phone: nextUser?.account_phone || '',
        time: nextOrder?.time || '시간 정보 없음',
      },
      selectedCounselor: {
        id: selectedUser?.account_id || null,
        name: selectedUser?.account_name || '미지정',
        phone: selectedUser?.account_phone || '',
        time: selectedOrder?.time || '시간 정보 없음', 
      }
    };
  }

  /**
   * [2.2] 인수인계 실행 로직
   */
  async handleHandover(loginUserId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const current = await tx.current.findUnique({ where: { id: 'singleton' } });
      if (!current) throw new NotFoundException('Current 데이터를 찾을 수 없습니다.');
      
      // 운영자 모드일 때는 일반 인수인계 차단
      if (current.isAdminMode) {
        throw new BadRequestException('운영자 점거 모드 중에는 일반 인수인계가 불가합니다.');
      }

      if (current.cur_account !== loginUserId) throw new UnauthorizedException('전환 권한이 없습니다.');

      const originalNextOrder = await tx.order.findFirst({
        where: { account_id: current.next_account }
      });
      if (!originalNextOrder) throw new NotFoundException('다음 시간표 순번을 찾을 수 없습니다.');

      await this.recordActivity(tx, current.cur_account, 'end');

      const updated = await tx.current.update({
        where: { id: 'singleton' },
        data: {
          cur_account: current.selected_account,
          next_account: originalNextOrder.next_id,
          selected_account: originalNextOrder.next_id,
        },
      });

      await this.recordActivity(tx, current.selected_account, 'start');
      return updated;
    });
  }

  /**
   * 상담원 목록 조회
   */
  async getAllCounselors() {
    return await this.prisma.account.findMany({
      select: {
        account_id: true,
        account_name: true,
        account_phone: true,
        isChief: true,
      },
      orderBy: { account_name: 'asc' },
    });
  }

  /**
   * [2.1-B] 다음 대기자 변경
   */
  async updateSelectedCounselor(targetId: string) {
    const current = await this.prisma.current.findUnique({ where: { id: 'singleton' } });
    if (!current) throw new NotFoundException('Current 데이터가 없습니다.');

    return await this.prisma.current.update({
      where: { id: 'singleton' },
      data: { selected_account: targetId },
    });
  }
  /**
   * [3.1] 현재 상담원 강제 교체 (비상용)
   */
  async updateCurrentAccount(targetId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const current = await tx.current.findUnique({ where: { id: 'singleton' } });
      if (!current) throw new NotFoundException('데이터가 없습니다.');

      await this.recordActivity(tx, current.cur_account, 'end');

      const updated = await tx.current.update({
        where: { id: 'singleton' },
        data: {
          cur_account: targetId,
          selected_account: targetId
        },
      });

      await this.recordActivity(tx, targetId, 'start');
      return updated;
    });
  }
  /**
   * [수정] 운영자 모드 ON/OFF 전환
   * ON(활성화)은 운영자만 가능, OFF(해제)는 누구나 가능
   */
  async toggleAdminMode(loginUserId: string, isOn: boolean, offsetMinutes: number = 0) {
    return await this.prisma.$transaction(async (tx) => {
      
      const current = await tx.current.findUnique({ where: { id: 'singleton' } });
      if (!current) throw new NotFoundException('데이터가 없습니다.');

      if (isOn) {
        /**
         * [점거 모드 활성화] - 오직 운영자(isChief)만 가능
         */
        const admin = await tx.account.findUnique({
          where: { account_id: loginUserId },
          select: { isChief: true }
        });

        // 활성화 시에만 권한 체크 수행
        if (!admin?.isChief) throw new UnauthorizedException('운영자 권한이 없습니다.');

        // 기존 상담원 근무 종료 기록
        await this.recordActivity(tx, current.cur_account, 'end');

        const updated = await tx.current.update({
          where: { id: 'singleton' },
          data: {
            cur_account: loginUserId,
            next_account: loginUserId,
            selected_account: loginUserId,
            isAdminMode: true,
          },
        });

        // 운영자 본인 근무 시작 기록
        await this.recordActivity(tx, loginUserId, 'start');
        return updated;

      } else {
        /**
         * [점거 모드 해제] - 누구나 가능 (권한 체크 패스)
         */
        // 이미 해제된 상태라면 중복 처리 방지 (선택 사항)
        if (!current.isAdminMode) return current;

        // 운영자 모드 종료 기록 (현재 점거 중인 운영자 번호 종료)
        await this.recordActivity(tx, current.cur_account, 'end');

        // [핵심] getRestoreData에 프론트에서 받은 offset 전달!
        const restoreData = await this.ordersService.getRestoreData(offsetMinutes);

        const updated = await tx.current.update({
          where: { id: 'singleton' },
          data: {
            cur_account: restoreData.cur_account,
            next_account: restoreData.next_account,
            selected_account: restoreData.next_account,
            isAdminMode: false,
          },
        });

        // 복구된 상담원 근무 시작 기록
        await this.recordActivity(tx, restoreData.cur_account, 'start');
        return updated;
      }
    });
  }

  /**
   * [신규] 특정 활동 내역 삭제
   */
  async deleteActivity(activityId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 삭제할 데이터 정보 가져오기 (시간 차감을 위해)
      const activity = await tx.activity.findUnique({
        where: { id: activityId },
      });

      if (!activity) throw new NotFoundException('해당 활동 내역을 찾을 수 없습니다.');

      // 2. 활동 내역 삭제
      await tx.activity.delete({
        where: { id: activityId },
      });

      // 3. 종료된 기록이고 hours가 있다면 계정의 total_hours에서 차감
      if (activity.end_time && activity.hours) {
        await tx.account.update({
          where: { account_id: activity.account_id },
          data: {
            total_hours: { decrement: activity.hours },
          },
        });
      }

      return { success: true };
    });
  }

  // [1.6] 모든 활동 내역 조회 (필터 및 페이징 포함)
  async getAllActivities(query: { keyword?: string; from?: string; to?: string; page?: number }) {
    const { keyword, from, to, page = 1 } = query;
    const skip = (page - 1) * 50;

    // 필터 조건 구성
    const where: any = {};
  
    if (keyword) {
      where.OR = [
        { account_id: { contains: keyword } },
        { account: { account_name: { contains: keyword } } }
      ];
    }

    if (from || to) {
      where.start_time = {};
      if (from) where.start_time.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999); // 해당 날짜 끝까지 포함
        where.start_time.lte = toDate;
      }
    }

    const [total, activities] = await Promise.all([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({
        where,
        include: { account: { select: { account_name: true } } }, // 이름 가져오기
        orderBy: { start_time: 'desc' },
        take: 50,
        skip,
      }),
    ]);

    return {
      total,
      data: activities.map(act => ({
        id: act.id,
        account_id: act.account_id,
        account_name: act.account?.account_name || '삭제된 상담원',
        start_time: act.start_time,
        end_time: act.end_time,
        hours: act.hours
      }))
    };
  }

  // [1.7] 수동 활동 기록 추가
  async addManualActivity(dto: { accountId: string, start: Date, end: Date, hours: number }) {
    return await this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          account_id: dto.accountId,
          start_time: dto.start,
          end_time: dto.end,
          hours: dto.hours,
        }
      });

      // 계정의 총 상담 시간 갱신
      await tx.account.update({
        where: { account_id: dto.accountId },
        data: { total_hours: { increment: dto.hours } }
      });

      return activity;
    });
  }
}
