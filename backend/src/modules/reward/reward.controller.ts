import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RewardService } from './reward.service';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { ManualCreditPointsDto } from './dto/credit-points.dto';
import { InitiateRedemptionDto } from './dto/initiate-redemption.dto';
import { ConfirmRedemptionDto } from './dto/confirm-redemption.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history.dto';

@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  /**
   * Get current user's point balance.
   */
  @Get('balance')
  async getBalance(@Request() req: any) {
    return this.rewardService.getBalance(req.user.sub);
  }

  /**
   * Get current user's streak info.
   */
  @Get('streak')
  async getStreak(@Request() req: any) {
    return this.rewardService.getStreakInfo(req.user.sub);
  }

  /**
   * Get transaction history for the current user.
   */
  @Get('transactions')
  async getTransactionHistory(
    @Request() req: any,
    @Query() query: TransactionHistoryQueryDto,
  ) {
    return this.rewardService.getTransactionHistory(req.user.sub, query);
  }

  /**
   * Get the reward catalog.
   */
  @Get('catalog')
  getCatalog(@Query('category') category?: string) {
    return this.rewardService.getRewardCatalog(category);
  }

  /**
   * Initiate a reward redemption.
   */
  @Post('redeem')
  async initiateRedemption(
    @Request() req: any,
    @Body() dto: InitiateRedemptionDto,
  ) {
    return this.rewardService.initiateRedemption(
      req.user.sub,
      dto.rewardId,
      dto.destinationNumber,
    );
  }

  /**
   * Confirm a redemption with OTP.
   */
  @Post('redeem/:redemptionId/confirm')
  async confirmRedemption(
    @Request() req: any,
    @Param('redemptionId') redemptionId: string,
    @Body() dto: ConfirmRedemptionDto,
  ) {
    return this.rewardService.confirmRedemption(
      req.user.sub,
      redemptionId,
      dto.otpCode,
    );
  }

  /**
   * Get redemption history for the current user.
   */
  @Get('redemptions')
  async getRedemptionHistory(
    @Request() req: any,
    @Query() query: TransactionHistoryQueryDto,
  ) {
    return this.rewardService.getRedemptionHistory(req.user.sub, query);
  }

  // ─── Admin Endpoints ──────────────────────────────────────────────────────

  /**
   * Manually credit points to a respondent (admin only).
   */
  @Post('admin/credit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async manualCredit(
    @Request() req: any,
    @Body() dto: ManualCreditPointsDto,
  ) {
    return this.rewardService.manualCreditPoints(
      req.user.sub,
      dto.respondentId,
      dto.amount,
      dto.reason,
    );
  }

  /**
   * Manually trigger expired points processing (admin only).
   */
  @Post('admin/process-expired')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async processExpired() {
    return this.rewardService.processExpiredPoints();
  }
}
