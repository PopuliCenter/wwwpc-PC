import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
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

  /**
   * Daftar responden mandiri + profil demografi (untuk laman admin Responden
   * & export). Boleh diakses admin (override @Roles tingkat-class super_admin).
   */
  @Get('respondents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async listRespondents(@Query('search') search?: string) {
    return this.userManagerService.getRespondents(search);
  }

  /** Hapus massal akun. Body: { ids: string[] }. Mengembalikan ringkasan. */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async bulkDelete(@Body('ids') ids: string[], @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.userManagerService.deleteUsers(
      Array.isArray(ids) ? ids : [],
      { userId: req.user.userId, role: req.user.role },
      ipAddress,
    );
  }

  /**
   * Hapus AKUN SENDIRI (self-service, wajib untuk Play Store). Tersedia untuk
   * semua peran yang login (override @Roles kelas yang super_admin-only). HARUS
   * dideklarasikan SEBELUM @Delete(':id') agar "me" tidak tertangkap sbg :id.
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.ANALYST,
    UserRole.SURVEYOR,
    UserRole.RESPONDENT,
  )
  async deleteOwnAccount(@Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.deleteOwnAccount(req.user.userId, ipAddress);
  }

  /**
   * Hapus permanen akun + data terkait. Boleh super_admin & admin (admin tak
   * bisa hapus super_admin; tak bisa hapus diri sendiri; tak bisa hapus akun
   * pembuat survei).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async deleteUser(@Param('id') id: string, @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.userManagerService.deleteUser(
      id,
      { userId: req.user.userId, role: req.user.role },
      ipAddress,
    );
  }

  @Get(':id/activity')
  async getUserActivityHistory(@Param('id') id: string) {
    return this.userManagerService.getUserActivityHistory(id);
  }

  @Post('bulk-import')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async bulkImportUsers(@Body('csv') csv: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.userManagerService.bulkImportUsers(csv, adminUserId, ipAddress);
  }
}
