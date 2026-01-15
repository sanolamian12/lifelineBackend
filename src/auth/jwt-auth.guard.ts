import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 'jwt'라는 이름은 우리가 앞서 만든 jwt.strategy.ts에서 
  // PassportStrategy(Strategy)를 상속받을 때 사용하는 기본 이름입니다.
}
