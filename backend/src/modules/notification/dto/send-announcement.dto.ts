import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class SendAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @IsOptional()
  @IsBoolean()
  sendPush?: boolean;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
