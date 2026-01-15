import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rawData = [
  { no: 1, id: "user_01", day: "Monday", time: "09 AM - 01 PM" },
  { no: 2, id: "user_02", day: "Monday", time: "01 PM - 05 PM" },
  { no: 3, id: "user_03", day: "Monday", time: "05 PM - 09 PM" },
  { no: 4, id: "user_04", day: "Monday", time: "09 PM - 09 AM" },
  { no: 5, id: "user_05", day: "Tuesday", time: "09 AM - 01 PM" },
  { no: 6, id: "user_06", day: "Tuesday", time: "01 PM - 05 PM" },
  { no: 7, id: "user_07", day: "Tuesday", time: "05 PM - 09 PM" },
  { no: 8, id: "user_08", day: "Tuesday", time: "09 PM - 09 AM" },
  { no: 9, id: "user_09", day: "Wednesday", time: "09 AM - 01 PM" },
  { no: 10, id: "user_10", day: "Wednesday", time: "01 PM - 05 PM" },
  { no: 11, id: "user_11", day: "Wednesday", time: "05 PM - 09 PM" },
  { no: 12, id: "user_12", day: "Wednesday", time: "09 PM - 09 AM" },
  { no: 13, id: "user_13", day: "Thursday", time: "09 AM - 01 PM" },
  { no: 14, id: "user_14", day: "Thursday", time: "01 PM - 05 PM" },
  { no: 15, id: "user_15", day: "Thursday", time: "05 PM - 09 PM" },
  { no: 16, id: "user_16", day: "Thursday", time: "09 PM - 06 AM" },
  { no: 17, id: "user_17", day: "Friday", time: "06 AM - 09 AM" },
  { no: 18, id: "user_18", day: "Friday", time: "09 AM - 01 PM" }, // 수정됨
  { no: 19, id: "user_19", day: "Friday", time: "01 PM - 05 PM" }, // 수정됨
  { no: 20, id: "user_20", day: "Friday", time: "05 PM - 09 PM" }, // 수정됨
  { no: 21, id: "user_21", day: "Friday", time: "09 PM - 09 AM" }, // 수정됨
  { no: 22, id: "user_22", day: "Saturday", time: "09 AM - 01 PM" }, // 수정됨
  { no: 23, id: "user_23", day: "Saturday", time: "01 PM - 05 PM" }, // 수정됨
  { no: 24, id: "user_24", day: "Saturday", time: "05 PM - 09 PM" }, // 수정됨
  { no: 25, id: "user_25", day: "Saturday", time: "09 PM - 09 AM" }, // 수정됨
  { no: 26, id: "user_26", day: "Sunday", time: "09 AM - 01 PM" }, // 수정됨
  { no: 27, id: "user_27", day: "Sunday", time: "01 PM - 05 PM" }, // 수정됨
  { no: 28, id: "user_28", day: "Sunday", time: "05 PM - 09 PM" }, // 수정됨
  { no: 29, id: "user_29", day: "Sunday", time: "09 PM - 09 AM" }, // 수정됨
];

const dayToDateMap: { [key: string]: number } = {
  "Monday": 6, "Tuesday": 7, "Wednesday": 8, "Thursday": 9, "Friday": 10, "Saturday": 11, "Sunday": 12
};

function parseTime(dayStr: string, timeStr: string, isEnd: boolean): Date {
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

async function main() {
  console.log('--- Order 데이터만 초기화 및 재생성 시작 ---');

  // 1. Order 테이블만 삭제
  await prisma.order.deleteMany({});
  console.log('기존 Order 데이터를 삭제했습니다.');

  // 2. 새로운 rawData 기반으로 Order 생성
  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    const nextItem = rawData[(i + 1) % rawData.length];

    await prisma.order.create({
      data: {
        account_id: item.id,
        day: item.day,
        time: item.time,
        order: item.no,
        next_id: nextItem.id,
        start_time: parseTime(item.day, item.time, false),
        end_time: parseTime(item.day, item.time, true),
      }
    });
  }

  console.log('--- 완료! 29개의 Order 데이터가 정상적으로 갱신되었습니다. ---');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
