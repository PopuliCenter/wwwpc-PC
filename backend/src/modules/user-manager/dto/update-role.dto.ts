import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '@shared/enums';

export class UpdateRoleDto {
  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;
}
