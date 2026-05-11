import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  HttpCode,
  HttpStatus,
  Delete,
  Param
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * [1.1] 로그인 (App/Web 공통)
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginData: { accountId: string; password: string }) {
    // Service에서 이미 user.isChief를 반환하도록 수정되었습니다.
    return await this.authService.login(loginData.accountId, loginData.password);
  }

  /**
   * [1.3.1] 아이디 중복 체크 (Web)
   */
  @Get('check-duplicate')
  async checkDuplicate(@Query('id') id: string) {
    return await this.authService.checkDuplicateId(id);
  }

  /**
   * [1.3] 계정 생성 (Web)
   * 수정: createDto에 isChief 추가
   */
  @Post('create')
  async create(@Body() createDto: { id: string; password: string; name: string; phone: string; isChief?: boolean }) {
    return await this.authService.createAccount(createDto);
  }

  /**
   * [1.4] 내 전화번호 수정 (App)
   */
  @Patch('update-phone')
  async updatePhone(@Body() updateDto: { id: string; newPhone: string }) {
    return await this.authService.updateMyPhone(updateDto.id, updateDto.newPhone);
  }

  /**
   * [1.6] 회원 정보 수정 (Web - 관리자 전용)
   * 수정: updateDto에 isChief 추가 (관리자가 일반 사용자를 운영자로 승격시키거나 강등할 때 사용)
   */
  @Patch('admin/update-account')
  async adminUpdateAccount(
    @Query('targetId') targetId: string,
    @Body() updateDto: { name?: string; phone?: string; password?: string; isChief?: boolean; isDeleted?: boolean }
  ) {
    return await this.authService.updateAccountByAdmin(targetId, updateDto);
  }

  /**
   * [1.2] 로그아웃
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { message: '로그아웃 되었습니다.' };
  }
  /**
   * [1.7] 모든 상담원 목록 조회
   * Flutter ApiService에서 /accounts로 호출하므로 경로를 맞춰줍니다.
   */
  @Get('/accounts') // 주소가 'auth/accounts'가 아닌 '/accounts'가 되도록 설정 (상대경로 주의)
  async findAll() {
    return await this.authService.getAllAccounts();
  }

  @Delete('admin/delete-account')
  async deleteAccount(@Query('targetId') targetId: string) {
    return await this.authService.deleteAccount(targetId);
  }

  @Patch('withdraw/:id') // PATCH /auth/withdraw/user_01 형식
  async withdraw(@Param('id') id: string) {
    await this.authService.requestWithdrawal(id);
    return { success: true, message: '계정 삭제 요청이 완료되었습니다.' };
  }
}
