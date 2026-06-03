import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { DashboardService } from './dashboard.service';
import { DashboardPeriodDto } from './dto';
import {
  OverviewMetrics,
  ChartData,
  DistributionData,
  HeatmapPoint,
  SurveyCompletionRate,
  DateRange,
} from './interfaces';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverviewMetrics(): Promise<OverviewMetrics> {
    return this.dashboardService.getOverviewMetrics();
  }

  @Get('registration-chart')
  async getRegistrationChart(
    @Query() query: DashboardPeriodDto,
  ): Promise<ChartData> {
    const period = this.buildDateRange(query);
    return this.dashboardService.getRegistrationChart(period);
  }

  @Get('cumulative-trend')
  async getCumulativeTrendChart(
    @Query() query: DashboardPeriodDto,
  ): Promise<ChartData> {
    const period = this.buildDateRange(query);
    return this.dashboardService.getCumulativeTrendChart(period);
  }

  @Get('distribution')
  async getDistributionCharts(): Promise<DistributionData> {
    return this.dashboardService.getDistributionCharts();
  }

  @Get('heatmap')
  async getHeatmapData(): Promise<HeatmapPoint[]> {
    return this.dashboardService.getHeatmapData();
  }

  @Get('completion-rates')
  async getSurveyCompletionRates(): Promise<SurveyCompletionRate[]> {
    return this.dashboardService.getSurveyCompletionRates();
  }

  private buildDateRange(query: DashboardPeriodDto): DateRange {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    return { startDate, endDate };
  }
}
