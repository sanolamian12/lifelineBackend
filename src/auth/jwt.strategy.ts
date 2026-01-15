import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'SECRET_KEY',
    });
  }

  /**
   * 토큰이 유효하면 실행되는 함수
   * 수정: payload에서 isChief를 꺼내어 req.user에 포함시킵니다.
   */
  async validate(payload: any) {
    // 여기서 반환되는 객체가 요청(Request)의 user 객체(req.user)가 됩니다.
    return { 
      userId: payload.sub, 
      username: payload.username,
      isChief: payload.isChief // 추가: 이제 req.user.isChief로 접근 가능합니다.
    };
  }
}
