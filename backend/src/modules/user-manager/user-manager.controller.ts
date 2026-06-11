import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserManagerService } from './user-manager.service';
import { CreateUserDto, UpdateRoleDto, UpdateUserDto, ListUsersFilterDto } from './dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UserManagerController {
  constructor(private readonly userManagerService: UserManagerService) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.userManagerService.createUser(dto, adminUserId, ipAddress);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.updateUser(id, dto, adminUserId, ipAddress);
  }

  @Patch(':id/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: any,
  ) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.updateUserRole(id, dto.role, adminUserId, ipAddress);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activateUser(@Param('id') id: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.activateUser(id, adminUserId, ipAddress);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateUser(@Param('id') id: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.deactivateUser(id, adminUserId, ipAddress);
  }

  @Post(':id/reset-password')
  async resetUserPassword(@Param('id') id: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.userManagerService.resetUserPassword(id, adminUserId, ipAddress);
  }

  @Get()
  async listUsers(@Query() filters: ListUsersFilterDto) {
    return this.userManagerService.listUsers(filters);
  }

  @Get(':id/activity')
  async getUserActivityHistory(@Param('id') id: string) {
    return this.userManagerService.getUserActivityHistory(id);
  }

  @Post('bulk-import')
  async bulkImportUsers(@Body('csv') csv: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.userManagerService.bulkImportUsers(csv, adminUserId, ipAddress);
  }
}
