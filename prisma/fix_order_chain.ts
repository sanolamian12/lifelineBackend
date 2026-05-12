/**
 * 시간표 체인 복구 스크립트 (1회용)
 *
 * 사용 시나리오:
 *   관리자 웹에서 /orders/bulk-update를 호출했을 때, 프론트가 보낸 배열의 순서가
 *   (요일, 시작시간) 정렬을 따르지 않으면 Order.order / Order.next_id 가 시간 흐름과
 *   어긋난 채로 저장된다. 그 결과 인수인계 시 "엉뚱한 다음 사람"이 표시된다.
 *
 *   이 스크립트는 Order 슬롯 배정은 그대로 두고,
 *   start_time ASC 정렬 결과를 기준으로 order / next_id만 재기록한다.
 *   (parseTime이 Mon=2025-01-06 ~ Sun=2025-01-12로 매핑하기 때문에
 *    start_time ASC 정렬은 자연스럽게 주간 시간 흐름과 일치한다.)
 *
 * 실행:
 *   1) Dry-run (확인용, DB 변경 없음):
 *        npx ts-node prisma/fix_order_chain.ts
 *   2) 실제 커밋:
 *        npx ts-node prisma/fix_order_chain.ts --commit
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

async function main() {
  console.log(`\n=== 시간표 체인 복구 ${COMMIT ? '[COMMIT MODE]' : '[DRY-RUN]'} ===\n`);

  await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      orderBy: { start_time: 'asc' },
      include: { account: { select: { account_name: true } } },
    });

    if (orders.length === 0) {
      console.log('Order 테이블이 비어 있습니다. 종료.');
      return;
    }

    console.log(`총 ${orders.length}개의 슬롯을 재배치합니다.\n`);

    // [Current 싱글톤 상태] — Current가 어디를 가리키는지 확인용
    const currentSnapshot = await tx.current.findUnique({ where: { id: 'singleton' } });
    if (currentSnapshot) {
      const [curAcc, nextAcc, selAcc] = await Promise.all([
        tx.account.findUnique({ where: { account_id: currentSnapshot.cur_account }, select: { account_name: true } }),
        tx.account.findUnique({ where: { account_id: currentSnapshot.next_account }, select: { account_name: true } }),
        tx.account.findUnique({ where: { account_id: currentSnapshot.selected_account }, select: { account_name: true } }),
      ]);
      const curSlot = orders.find((o) => o.account_id === currentSnapshot.cur_account);
      console.log('--- Current (singleton) 상태 ---');
      console.log(`  cur_account:      ${currentSnapshot.cur_account.padEnd(10)} (${curAcc?.account_name ?? 'NOT FOUND'})`);
      console.log(`  next_account:     ${currentSnapshot.next_account.padEnd(10)} (${nextAcc?.account_name ?? 'NOT FOUND'})`);
      console.log(`  selected_account: ${currentSnapshot.selected_account.padEnd(10)} (${selAcc?.account_name ?? 'NOT FOUND'})`);
      console.log(`  isAdminMode:      ${currentSnapshot.isAdminMode}`);
      console.log(`  lastUpdated:      ${currentSnapshot.lastUpdated.toISOString()}`);
      if (curSlot) {
        console.log(`  → cur의 시간표 슬롯: ${curSlot.day} ${curSlot.time}  (order=${curSlot.order}, next_id=${curSlot.next_id})`);
        const expectedNext = curSlot.next_id;
        const match = expectedNext === currentSnapshot.next_account;
        console.log(`  → next_account vs cur 슬롯의 next_id: ${match ? '일치' : `불일치  (Order상 next=${expectedNext}, Current.next=${currentSnapshot.next_account})`}`);
      } else {
        console.log(`  → 주의: cur_account(${currentSnapshot.cur_account})에 해당하는 시간표 슬롯이 없음`);
      }
      const nowSydney = new Date(Date.now() + 10 * 60 * 60 * 1000);
      console.log(`  (서버 UTC now: ${new Date().toISOString()})`);
      console.log(`  (시드니 추정 now: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][nowSydney.getUTCDay()]} ${nowSydney.getUTCHours()}:${String(nowSydney.getUTCMinutes()).padStart(2,'0')})`);
      console.log();
    } else {
      console.log('--- Current 싱글톤이 존재하지 않습니다 ---\n');
    }

    // [BEFORE 스냅샷] 현재 DB에 저장된 order/next_id 그대로 출력 — 롤백 레퍼런스용
    console.log('--- BEFORE (현재 DB 상태, 롤백용 백업 레퍼런스) ---');
    console.log('순번 | day        | time             | id      | 상담원        | next_id');
    console.log('-----+------------+------------------+---------+--------------+----------------');
    for (const row of orders) {
      console.log(
        `${String(row.order).padStart(4)} | ${row.day.padEnd(10)} | ${row.time.padEnd(16)} | ${row.account_id.padEnd(7)} | ${(row.account?.account_name ?? row.account_id).padEnd(12)} | ${row.next_id}`,
      );
    }
    console.log();

    // [AFTER 계획] start_time ASC 정렬 결과로 재계산한 값
    console.log('--- AFTER (재배치 후 계획, * 는 변경되는 행) ---');
    console.log('새 순번 | day        | time             | id      | 상담원        | 새 next_id            | 변경 전 (order / next_id)');
    console.log('--------+------------+------------------+---------+--------------+-----------------------+---------------------------');

    const updates: { id: string; newOrder: number; newNextId: string; oldOrder: number; oldNextId: string }[] = [];

    for (let i = 0; i < orders.length; i++) {
      const row = orders[i];
      const nextRow = orders[(i + 1) % orders.length];
      const newOrder = i + 1;
      const newNextId = nextRow.account_id;

      const changed = row.order !== newOrder || row.next_id !== newNextId;
      const marker = changed ? '*' : ' ';
      const oldInfo = changed ? `${row.order} / ${row.next_id}` : '(변경 없음)';
      console.log(
        `${marker} ${String(newOrder).padStart(4)} | ${row.day.padEnd(10)} | ${row.time.padEnd(16)} | ${row.account_id.padEnd(7)} | ${(row.account?.account_name ?? row.account_id).padEnd(12)} | ${newNextId.padEnd(20)} | ${oldInfo}`,
      );

      if (changed) {
        updates.push({
          id: row.id,
          newOrder,
          newNextId,
          oldOrder: row.order,
          oldNextId: row.next_id,
        });
      }
    }

    console.log(`\n변경 대상 (Order): ${updates.length} / ${orders.length} 행 (별표 표시된 행)`);

    // [Current 보정 계획 계산] — Order 변경 여부와 독립적으로 평가
    let currentPlan: {
      newNext: string;
      newSelected: string;
      preserveSelected: boolean;
      reason: string;
    } | null = null;

    if (currentSnapshot && !currentSnapshot.isAdminMode) {
      const curRow = orders.find((o) => o.account_id === currentSnapshot.cur_account);
      if (curRow) {
        const expectedNext = curRow.next_id;
        const nextMismatch = currentSnapshot.next_account !== expectedNext;
        const preserveSelected =
          currentSnapshot.selected_account !== currentSnapshot.next_account &&
          currentSnapshot.selected_account === expectedNext;
        const newSelected = preserveSelected ? currentSnapshot.selected_account : expectedNext;
        const selectedMismatch = currentSnapshot.selected_account !== newSelected;
        if (nextMismatch || selectedMismatch) {
          currentPlan = {
            newNext: expectedNext,
            newSelected,
            preserveSelected,
            reason:
              preserveSelected
                ? 'selected가 이미 정답이라 보존, next만 보정'
                : 'next/selected 모두 cur 슬롯의 next_id로 정렬',
          };
        }
      }
    }

    if (currentPlan) {
      console.log(`변경 대상 (Current): 필요  (${currentPlan.reason})`);
      console.log(`  next_account:     ${currentSnapshot!.next_account} -> ${currentPlan.newNext}`);
      console.log(
        `  selected_account: ${currentSnapshot!.selected_account} -> ${currentPlan.newSelected}` +
          (currentPlan.preserveSelected ? ' (수동 선택값 보존)' : ''),
      );
    } else {
      console.log(`변경 대상 (Current): 없음`);
    }
    console.log();

    if (updates.length === 0 && !currentPlan) {
      console.log('Order 체인과 Current 모두 정상입니다. 변경 없음.');
      return;
    }

    if (!COMMIT) {
      console.log('Dry-run 종료. 실제 적용하려면 --commit 플래그와 함께 다시 실행하세요.');
      return;
    }

    // 실제 적용 — Order 변경
    for (const u of updates) {
      await tx.order.update({
        where: { id: u.id },
        data: { order: u.newOrder, next_id: u.newNextId },
      });
    }
    if (updates.length > 0) {
      console.log(`Order 테이블 ${updates.length}건 갱신 완료.`);
    }

    // 실제 적용 — Current 보정
    if (currentPlan) {
      await tx.current.update({
        where: { id: 'singleton' },
        data: {
          next_account: currentPlan.newNext,
          selected_account: currentPlan.newSelected,
          lastUpdated: new Date(),
        },
      });
      console.log(`Current 갱신 완료.`);
    }
  });

  console.log('\n=== 완료 ===\n');
}

main()
  .catch((e) => {
    console.error('실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
