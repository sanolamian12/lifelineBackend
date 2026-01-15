import { Controller, Delete, Param, Query, Get, Post, Patch, UseGuards, Request, Body, ForbiddenException, Req } from '@nestjs/common';
import { CurrentService } from './current.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('current')
@UseGuards(JwtAuthGuard)
export class CurrentController {
  constructor(private currentService: CurrentService) {}

  /**
   * [2.0] 메인 화면 데이터 조회
   */
  @Get('status')
  async getStatus(@Request() req) {
    return this.currentService.getHandoverStatus(req.user.userId);
  }

  /**
   * [2.2] 표준 인수인계 실행
   */
  @Post('handover')
  async doHandover(@Request() req) {
    return this.currentService.handleHandover(req.user.userId);
  }

  /**
   * [2.1-A] 상담원 전체 목록 조회
   */
  @Get('counselors')
  async getCounselors() {
    return this.currentService.getAllCounselors();
  }

  /**
   * [2.1-B] 다음 대기자 수동 변경
   */
  @Patch('select')
  async selectCounselor(@Body('selectedId') selectedId: string) {
    console.log('상담원 선택 요청 수신:', selectedId); // 로그로 확인용
    return await this.currentService.updateSelectedCounselor(selectedId);
  }

  /**
   * [3.1] 현재 상담원 강제 변경 (비상용)
   * 권한: 운영자(Chief) 또는 현재 상담원 본인만 가능
   */
  @Post('force-change-current')
  async forceChangeCurrent(@Request() req, @Body('targetId') targetId: string) {
    const { userId, isChief } = req.user;
    const status = await this.currentService.getHandoverStatus(userId);
    
    if (!isChief && status.currentCounselor.id !== userId) {
      throw new ForbiddenException('변경 권한이 없습니다. (운영자 또는 현재 상담자만 가능)');
    }
    return this.currentService.updateCurrentAccount(targetId);
  }

  /**
   * [3.2] 운영자 모드 ON/OFF (비상 모드)
   * 권한: 운영자(Chief)만 가능
   */
  @Post('toggle-admin')
  async toggleAdmin(
    @Body() body: { isOn: boolean; offset?: number; accountId: string } // accountId 추가
  ) {
    // body에서 accountId를 추출해서 서비스로 넘깁니다.
    return await this.currentService.toggleAdminMode(body.accountId, body.isOn, body.offset || 0);
  }
  /**
   * [1.5] 내 활동 내역 조회
   */
  @Get('my-activities')
  async getMyActivities(@Request() req) {
    return this.currentService.getMyActivities(req.user.userId);
  }
  /**
   * [신규] 특정 활동 내역 삭제
   * DELETE /current/activity/:id
   */
  @Delete('activity/:id')
  // @UseGuards(JwtAuthGuard) // 토큰 인증이 필요한 경우 주석 해제
  async deleteActivity(@Param('id') id: string) {
    return await this.currentService.deleteActivity(id);
  }

  @Get('all-activities')
  async getAllActivities(@Query() query: any) {
    return this.currentService.getAllActivities(query);
  }

  @Post('activity/manual')
  async addManualActivity(@Body() body: any) {
    return this.currentService.addManualActivity(body);
  }
}
