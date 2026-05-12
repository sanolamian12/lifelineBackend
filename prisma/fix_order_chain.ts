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
    console.log('id                                   | day        | time             | 상담원        | order | next_id');
    console.log('-------------------------------------+------------+------------------+--------------+-------+----------------');
    for (const row of orders) {
      console.log(
        `${row.id.padEnd(36)} | ${row.day.padEnd(10)} | ${row.time.padEnd(16)} | ${(row.account?.account_name ?? row.account_id).padEnd(12)} | ${String(row.order).padStart(5)} | ${row.next_id}`,
      );
    }
    console.log();

    // [AFTER 계획] start_time ASC 정렬 결과로 재계산한 값
    console.log('--- AFTER (재배치 후 계획, * 는 변경되는 행) ---');
    console.log('새 순번 | day        | time             | 상담원        | 새 next_id            | 변경 전 (order / next_id)');
    console.log('--------+------------+------------------+--------------+-----------------------+---------------------------');

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
        `${marker} ${String(newOrder).padStart(4)} | ${row.day.padEnd(10)} | ${row.time.padEnd(16)} | ${(row.account?.account_name ?? row.account_id).padEnd(12)} | ${newNextId.padEnd(20)} | ${oldInfo}`,
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

    console.log(`\n변경 대상: ${updates.length} / ${orders.length} 행 (별표 표시된 행)\n`);

    if (updates.length === 0) {
      console.log('체인이 이미 정상입니다. 변경 없음.');
      return;
    }

    if (!COMMIT) {
      console.log('Dry-run 종료. 실제 적용하려면 --commit 플래그와 함께 다시 실행하세요.');
      return;
    }

    // 실제 적용
    for (const u of updates) {
      await tx.order.update({
        where: { id: u.id },
        data: { order: u.newOrder, next_id: u.newNextId },
      });
    }
    console.log(`Order 테이블 ${updates.length}건 갱신 완료.`);

    // Current 보정
    const current = await tx.current.findUnique({ where: { id: 'singleton' } });
    if (!current) {
      console.log('Current 싱글톤이 없어 Current 갱신은 건너뜁니다.');
      return;
    }

    if (current.isAdminMode) {
      console.log('운영자 모드 활성 상태 — Current 자동 갱신은 건너뜁니다.');
      return;
    }

    const curRow = orders.find((o) => o.account_id === current.cur_account);
    if (!curRow) {
      console.log(`현재 상담원(${current.cur_account})이 시간표에 없습니다 — Current 갱신 건너뜀.`);
      return;
    }

    const curIdx = orders.indexOf(curRow);
    const newNextForCurrent = orders[(curIdx + 1) % orders.length].account_id;

    const preserveSelected = current.selected_account !== current.next_account;
    const newSelected = preserveSelected ? current.selected_account : newNextForCurrent;

    await tx.current.update({
      where: { id: 'singleton' },
      data: {
        next_account: newNextForCurrent,
        selected_account: newSelected,
        lastUpdated: new Date(),
      },
    });

    console.log(`\nCurrent 갱신:`);
    console.log(`  cur_account:      ${current.cur_account} (변경 없음)`);
    console.log(`  next_account:     ${current.next_account} -> ${newNextForCurrent}`);
    console.log(
      `  selected_account: ${current.selected_account} -> ${newSelected}` +
        (preserveSelected ? ' (사용자 수동 선택값 보존)' : ''),
    );
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
