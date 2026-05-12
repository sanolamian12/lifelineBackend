import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private async findOrderByCurrentTime(offsetMinutes: number = 0) {
    const now = new Date();
    // 1. UTC 시간 + 프론트에서 준 오프셋(시드니 +660 등)
    const localNow = new Date(now.getTime() + (offsetMinutes * 60 * 1000));

    console.log('--- Time Debug Start ---');
    console.log('Server UTC Now:', now.toISOString());
    console.log('Received Offset:', offsetMinutes);
    console.log('Calculated localNow (UTC string):', localNow.toISOString());
    console.log('Target Hour:', localNow.getUTCHours());
    console.log('--- Time Debug End ---');

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
    // 2. 가상 로컬 시간에서 요일, 시, 분을 추출 (ISO 문자열에서 직접 파싱하는 것이 가장 안전함)
    // localNow.toISOString()은 여전히 UTC 기준이므로, 수동으로 시간 정보를 뽑습니다.
    const hour = localNow.getUTCHours(); // 이미 offset이 더해졌으므로 UTCHours가 현지 시간이 됨
    const min = localNow.getUTCMinutes();
    const dayIdx = localNow.getUTCDay();

    const currentDayStr = days[dayIdx];
    const dayToDateMap = {
      "Monday": 6, "Tuesday": 7, "Wednesday": 8, "Thursday": 9, "Friday": 10, "Saturday": 11, "Sunday": 12
    };

    // 3. 비교용 가상 날짜 (2025년 기준 데이터와 비교)
    const virtualNow = new Date(2025, 0, dayToDateMap[currentDayStr], hour, min);
  
    const yesterdayIdx = (dayIdx + 6) % 7;
    const virtualYesterday = new Date(2025, 0, dayToDateMap[days[yesterdayIdx]], hour, min);

    return await this.prisma.order.findFirst({
      where: {
        OR: [
          { start_time: { lte: virtualNow }, end_time: { gt: virtualNow } },
          { start_time: { lte: virtualYesterday }, end_time: { gt: virtualNow } }
        ]
      }
    });
  }
  // 2. 기존 getCurrentOrderNo 수정
  async getCurrentOrderNo(offsetMinutes: number): Promise<number | null> {
    const currentOrder = await this.findOrderByCurrentTime(offsetMinutes);
    return currentOrder ? currentOrder.order : null;
  }

  /**
   * 3. 운영자 모드 해제 시 시간표 복구 데이터 생성
   * CurrentService에서 이 함수를 호출하여 복구 정보를 얻습니다.
   */
  async getRestoreData(offset: number = 0) {
    const currentOrder = await this.findOrderByCurrentTime(offset); // offset 전달

    if (!currentOrder) {
      throw new NotFoundException('현재 시간에 배정된 상담원이 없습니다.');
    }
    return {
      cur_account: currentOrder.account_id,
      next_account: currentOrder.next_id,
      isAdminMode: false,
    };
  }

  /**
   * 4. 전체 스케줄 조회 (화면 표시용)
   */
  async getAllOrders() {
    return await this.prisma.order.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        day: true,
        time: true,
        order: true,
        account_id: true,
        account: { select: { account_name: true } },
      },
    });
  }

  /**
   * [내부 헬퍼] 시간 문자열 파싱
   */
  private parseTime(dayStr: string, timeStr: string, isEnd: boolean): Date {
    const dayToDateMap = { "Monday": 6, "Tuesday": 7, "Wednesday": 8, "Thursday": 9, "Friday": 10, "Saturday": 11, "Sunday": 12 };
    const [startPart, endPart] = timeStr.split(" - ");
    const targetPart = isEnd ? endPart : startPart;
    let [hourStr, ampm] = targetPart.split(" ");
    let hour = parseInt(hourStr);
    
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    
    const date = new Date(2025, 0, dayToDateMap[dayStr], hour, 0, 0);
    
    if (isEnd && hour <= 9 && startPart.includes("PM")) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }
  
  async getScheduleMetadata() {
    const current = await this.prisma.current.findUnique({
      where: { id: "singleton" },
      select: { lastUpdated: true }
    });
    return current?.lastUpdated || new Date();
  }

  // src/orders/orders.service.ts

  async updateWeeklySchedule(newScheduleData: any[], offsetMinutes: number = 0) {
    // [안전망] 프론트가 행을 (요일, 시작시각) 순으로 정렬해서 보내지 않으면
    // next_id 체인이 시간 흐름과 무관하게 짜여서 인수인계가 엉뚱한 사람으로 넘어간다.
    // 서버에서 한 번 더 정렬해서 그 위험을 차단한다.
    newScheduleData.sort(
      (a, b) =>
        this.parseTime(a.day, a.time, false).getTime() -
        this.parseTime(b.day, b.time, false).getTime(),
    );

    return await this.prisma.$transaction(async (tx) => {
      // 1. 기존 데이터 백업 (기존 로직 유지)
      const currentOrders = await tx.order.findMany();
      if (currentOrders.length > 0) {
        await tx.orderBackup.deleteMany({});
        await tx.orderBackup.createMany({
          data: currentOrders.map(o => ({
            account_id: o.account_id,
            day: o.day,
            time: o.time,
            next_id: o.next_id,
            order: o.order,
            start_time: o.start_time,
            end_time: o.end_time
          }))
        });
      }

      // 2. 기존 시간표 삭제
      await tx.order.deleteMany({});

      // 3. 새로운 시간표 데이터 삽입
      // 가공된 데이터를 루프 돌며 생성
      for (let i = 0; i < newScheduleData.length; i++) {
        const item = newScheduleData[i];
        const nextItem = newScheduleData[(i + 1) % newScheduleData.length];

        await tx.order.create({
          data: {
            account_id: item.account_id,
            day: item.day,
            time: item.time,
            order: i + 1,
            next_id: nextItem.account_id, // 다음 순번 상담원 ID 저장
            start_time: this.parseTime(item.day, item.time, false),
            end_time: this.parseTime(item.day, item.time, true),
          }
        });
      }

      // 4. [핵심] 새 시간표 기준 현재 상담원 매칭
      // 프론트에서 받은 시드니 오프셋(예: +600/+660분)을 그대로 전달해 현지 시각 기준으로 슬롯을 잡는다.
      const currentOrder = await this.findOrderInTransaction(tx, offsetMinutes);

      const fallbackAccount = newScheduleData[0].account_id;
      const fallbackNext = newScheduleData[1]?.account_id || fallbackAccount;

      const targetCur = currentOrder?.account_id || fallbackAccount;
      const targetNext = currentOrder?.next_id || fallbackNext;

      // OrdersService.ts의 updateWeeklySchedule 내부 (Current 업데이트 직전)
      const oldCurrent = await tx.current.findUnique({ where: { id: 'singleton' } });
      if (oldCurrent && oldCurrent.cur_account !== targetCur) {
          // 기존 사람 종료 기록 (CurrentService의 함수를 가져오거나 직접 tx로 처리)
         await this.recordActivityInternal(tx, oldCurrent.cur_account, 'end');
         // 새 사람 시작 기록
         await this.recordActivityInternal(tx, targetCur, 'start');
      }

      // 5. Current 테이블 싱크 업데이트
      await tx.current.upsert({
        where: { id: "singleton" },
        update: {
          cur_account: targetCur,
          next_account: targetNext,
          selected_account: targetNext, // 기본적으로 수동 선택값도 다음 사람으로 초기화
          isAdminMode: false, // 시간표 대규모 개편 시 운영자 모드는 해제하는 것이 안전
          lastUpdated: new Date(),
        },
        create: {
          id: "singleton",
          cur_account: targetCur,
          next_account: targetNext,
          selected_account: targetNext,
          isAdminMode: false,
        }
      });

      return { success: true, count: newScheduleData.length };
    });
  }

  // 트랜잭션 내에서 현재 상담원을 찾기 위한 내부 함수
  private async findOrderInTransaction(tx: any, offsetMinutes: number) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayToDateMap = { "Monday": 6, "Tuesday": 7, "Wednesday": 8, "Thursday": 9, "Friday": 10, "Saturday": 11, "Sunday": 12 };
  
    const now = new Date();
    const localNow = new Date(now.getTime() + (offsetMinutes * 60 * 1000));
    const hour = localNow.getUTCHours();
    const min = localNow.getUTCMinutes();
    const dayIdx = localNow.getUTCDay();
    const currentDayStr = days[dayIdx];

    const virtualNow = new Date(2025, 0, dayToDateMap[currentDayStr], hour, min);
  
    return await tx.order.findFirst({
      where: {
        start_time: { lte: virtualNow },
        end_time: { gt: virtualNow }
      }
    });
  }

  // [새 기능 추가] 되돌리기 (Restore)
  async restoreSchedule(offsetMinutes: number = 0) {
    return await this.prisma.$transaction(async (tx) => {
      const backups = await tx.orderBackup.findMany();
      if (backups.length === 0) {
        throw new BadRequestException('복구할 백업 데이터가 존재하지 않습니다.');
      }

      // 1. 현재 Order 삭제
      await tx.order.deleteMany({});

      // 2. 백업본을 다시 Order로 복사
      for (const b of backups) {
        await tx.order.create({
          data: {
            account_id: b.account_id,
            day: b.day,
            time: b.time,
            next_id: b.next_id,
            order: b.order,
            start_time: b.start_time,
            end_time: b.end_time
          }
        });
      }

      // 3. Current 테이블 싱크 맞추기 (시드니 오프셋 반영)
      const currentOrder = await this.findOrderByCurrentTime(offsetMinutes);
      if (currentOrder) {
        await tx.current.update({
          where: { id: "singleton" },
          data: {
            cur_account: currentOrder.account_id,
            next_account: currentOrder.next_id,
            selected_account: currentOrder.next_id,
            lastUpdated: new Date()
          }
        });
      }

      return { success: true, message: '백업본으로부터 시간표가 성공적으로 복구되었습니다.' };
    });
  }
  /**
   * [내부 헬퍼] 활동 내역 기록 및 누적 시간 업데이트
   * CurrentService의 recordActivity와 동일한 로직을 OrdersService 내부 트랜잭션용으로 구현
   */
  private async recordActivityInternal(tx: any, accountId: string, flag: 'start' | 'end') {
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
}
