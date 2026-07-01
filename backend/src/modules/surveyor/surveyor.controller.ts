import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { FileUploadService } from '@modules/response/services/file-upload.service';
import { UploadedFileLike } from '@modules/response/services/file-validation.service';
import { SurveyorService } from './surveyor.service';
import { SubmitSurveyorResponseDto } from './dto/submit-surveyor-response.dto';

// Batas ukuran upload (selaras dengan endpoint responden).
const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

/** Endpoint untuk surveyor (TPD): survei saya, nomor saya, pengisian lapangan. */
@Controller('surveyor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SURVEYOR)
export class SurveyorController {
  constructor(
    private readonly surveyorService: SurveyorService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /** Upload berkas media (foto/audio/tanda tangan/berkas) oleh surveyor. */
  @Post('surveys/:surveyId/responses/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadFile(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.fileUploadService.uploadAnswerFile(surveyId, req.user.userId, file);
  }

  @Get('surveys')
  async mySurveys(@Request() req: any) {
    return this.surveyorService.getMySurveys(req.user.userId);
  }

  @Get('surveys/:surveyId/numbers')
  async myNumbers(@Param('surveyId') surveyId: string, @Request() req: any) {
    return this.surveyorService.getMyNumbers(surveyId, req.user.userId);
  }

  @Get('surveys/:surveyId/fill')
  async fillData(@Param('surveyId') surveyId: string, @Request() req: any) {
    return this.surveyorService.getFillData(surveyId, req.user.userId);
  }

  @Post('surveys/:surveyId/responses')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Param('surveyId') surveyId: string,
    @Body() dto: SubmitSurveyorResponseDto,
    @Request() req: any,
  ) {
    return this.surveyorService.submitResponse(surveyId, req.user.userId, dto);
  }
}
