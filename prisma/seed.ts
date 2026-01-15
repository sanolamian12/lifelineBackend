import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const rawData = [
  { no: 1, id: "user_01", pw: "Lifeline1!", name: "김다혜", phone: "0450620272", day: "Monday", time: "09 AM - 01 PM" },
  { no: 2, id: "user_02", pw: "Lifeline1!", name: "김린", phone: "0414860252", day: "Monday", time: "01 PM - 05 PM" },
  { no: 3, id: "user_03", pw: "Lifeline1!", name: "김은정", phone: "0432236706", day: "Monday", time: "05 PM - 09 PM" },
  { no: 4, id: "user_04", pw: "Lifeline1!", name: "유성옥", phone: "0433997576", day: "Monday", time: "09 PM - 09 AM" },
  { no: 5, id: "user_05", pw: "Lifeline1!", name: "박진선", phone: "0402425740", day: "Tuesday", time: "09 AM - 01 PM" },
  { no: 6, id: "user_06", pw: "Lifeline1!", name: "송수옥", phone: "0401563172", day: "Tuesday", time: "01 PM - 05 PM" },
  { no: 7, id: "user_07", pw: "Lifeline1!", name: "권유향", phone: "0413678860", day: "Tuesday", time: "05 PM - 09 PM" },
  { no: 8, id: "user_08", pw: "Lifeline1!", name: "김희진", phone: "0405505693", day: "Tuesday", time: "09 PM - 09 AM" },
  { no: 9, id: "user_09", pw: "Lifeline1!", name: "전진영", phone: "0403279646", day: "Wednesday", time: "09 AM - 01 PM" },
  { no: 10, id: "user_10", pw: "Lifeline1!", name: "류선희", phone: "0401616493", day: "Wednesday", time: "01 PM - 05 PM" },
  { no: 11, id: "user_11", pw: "Lifeline1!", name: "김중헌", phone: "0431885654", day: "Wednesday", time: "05 PM - 09 PM" },
  { no: 12, id: "user_12", pw: "Lifeline1!", name: "서미진", phone: "0430045078", day: "Wednesday", time: "09 PM - 09 AM" },
  { no: 13, id: "user_13", pw: "Lifeline1!", name: "황기철", phone: "0413515788", day: "Thursday", time: "09 AM - 01 PM" },
  { no: 14, id: "user_14", pw: "Lifeline1!", name: "심선희", phone: "0417323465", day: "Thursday", time: "01 PM - 05 PM" },
  { no: 15, id: "user_15", pw: "Lifeline1!", name: "김태은", phone: "0430181669", day: "Thursday", time: "05 PM - 09 PM" },
  { no: 16, id: "user_16", pw: "Lifeline1!", name: "김화연", phone: "0425866107", day: "Thursday", time: "09 PM - 06 AM" },
  { no: 17, id: "user_17", pw: "Lifeline1!", name: "백옥주", phone: "0430137720", day: "Friday", time: "06 AM - 09 PM" },
  { no: 18, id: "user_18", pw: "Lifeline1!", name: "윤예경", phone: "0421561161", day: "Friday", time: "09 AM - 01 PM" },
  { no: 19, id: "user_19", pw: "Lifeline1!", name: "홍성희", phone: "0412004960", day: "Friday", time: "01 PM - 05 PM" },
  { no: 20, id: "user_20", pw: "Lifeline1!", name: "강순리", phone: "0414778133", day: "Friday", time: "05 PM - 09 PM" },
  { no: 21, id: "user_21", pw: "Lifeline1!", name: "한부희", phone: "0421700087", day: "Friday", time: "09 PM - 09 AM" },
  { no: 22, id: "user_22", pw: "Lifeline1!", name: "손미화", phone: "0426891974", day: "Saturday", time: "09 AM - 01 PM" },
  { no: 23, id: "user_23", pw: "Lifeline1!", name: "이현실", phone: "0409037036", day: "Saturday", time: "01 PM - 05 PM" },
  { no: 24, id: "user_24", pw: "Lifeline1!", name: "전미리", phone: "0423919209", day: "Saturday", time: "05 PM - 09 PM" },
  { no: 25, id: "user_25", pw: "Lifeline1!", name: "박소희", phone: "0450688134", day: "Saturday", time: "09 PM - 09 AM" },
  { no: 26, id: "user_26", pw: "Lifeline1!", name: "이장섭", phone: "0432659434", day: "Sunday", time: "09 AM - 01 PM" },
  { no: 27, id: "user_27", pw: "Lifeline1!", name: "유종복", phone: "0491743474", day: "Sunday", time: "01 PM - 05 PM" },
  { no: 28, id: "user_28", pw: "Lifeline1!", name: "유진영", phone: "0432523193", day: "Sunday", time: "05 PM - 09 PM" },
  { no: 29, id: "user_29", pw: "Lifeline1!", name: "이호경", phone: "0450627277", day: "Sunday", time: "09 PM - 09 AM" },
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
  const saltRounds = 10;

  // 데이터 초기화
  await prisma.activity.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.current.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.auth.deleteMany({});

  console.log('--- E.164 규격 적용 초기 데이터 생성 시작 ---');

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    const nextItem = rawData[(i + 1) % rawData.length];
    const hashedPassword = await bcrypt.hash(item.pw, saltRounds);
    const isChief = item.id === "user_12";

    // 전화번호 변환 로직: 0450620272 -> +61450620272
    const formattedPhone = item.phone.startsWith('0') 
      ? `+61${item.phone.substring(1)}` 
      : item.phone;

    await prisma.auth.create({
      data: {
        account_id: item.id,
        account_pw: hashedPassword,
        account: {
          create: {
            account_name: item.name,
            account_phone: formattedPhone, // 수정된 번호 저장
            isChief: isChief,
          }
        }
      }
    });

    // 2. [추가] Order 데이터 생성 (이 부분이 누락되어 데이터가 안 보였던 것입니다)
    await prisma.order.create({
    data: {
      id: `order_${item.no}`,
      account_id: item.id,
      time: item.time,    // "09 AM - 01 PM" 등이 저장됨
      next_id: nextItem.id, // 다음 사람의 ID 저장
      
      // 추가된 필수 필드들
      day: item.day,            // "Monday" 등
      order: item.no,           // 1, 2, 3... 순서
      start_time: parseTime(item.day, item.time, false), // 아까 정의된 parseTime 함수 사용
      end_time: parseTime(item.day, item.time, true),
    }
  });
  }

  // Current 싱글톤 생성
  await prisma.current.create({
    data: {
      id: "singleton",
      cur_account: rawData[0].id,
      next_account: rawData[1].id,
      selected_account: rawData[1].id,
      isAdminMode: false
    }
  });
  

  console.log('--- Seed 완료: 모든 번호가 +61 형식으로 변환되었습니다. ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

