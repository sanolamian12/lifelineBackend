import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. CORS 설정: 다른 도메인(앱, 웹)에서 이 서버로 요청을 보낼 수 있게 허용합니다.
  app.enableCors();

  // 2. 외부 접속 허용: '0.0.0.0'을 지정해야 EC2 외부 IP를 통해 들어오는 요청을 서버가 수신합니다.
  // process.env.PORT가 있으면 쓰고, 없으면 3000번을 사용합니다.
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log(`🚀 Server is running on: http://0.0.0.0:${port}`);
}
bootstrap();
