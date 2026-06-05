import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponseService } from './response.service';
import { FileUploadService } from './services/file-upload.service';
import { UploadedFileLike } from './services/file-validation.service';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SaveProgressDto } from './dto/save-progress.dto';
import { ResponseFilterDto } from './dto/response-filter.dto';
import { MarkRewardDistributedDto } from './dto/mark-reward-distributed.dto';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

// Hard cap enforced by Multer before the file is buffered into memory.
const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

@Controller('surveys/:surveyId/responses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponseController {
  constructor(
    private readonly responseService: ResponseService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Upload a file for a file_upload question. Validates size, MIME type, and
   * magic bytes, stores it privately in object storage, and returns the object
   * key (to be submitted as the answer value) plus a short-lived preview URL.
   */
  @Post('upload')
  @Roles(UserRole.RESPONDENT)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadFile(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.fileUploadService.uploadAnswerFile(surveyId, req.user.userId, file);
  }

  /**
   * Submit a complete response to a survey.
   * Only respondents can submit responses.
   */
  @Post('submit')
  @Roles(UserRole.RESPONDENT)
  @HttpCode(HttpStatus.CREATED)
  async submitResponse(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
    @Body() dto: SubmitResponseDto,
  ) {
    return this.responseService.submitResponse(surveyId, req.user.userId, dto);
  }

  /**
   * Save progress (auto-save) for an in-progress response.
   * Only respondents can save progress.
   */
  @Post('save-progress')
  @Roles(UserRole.RESPONDENT)
  @HttpCode(HttpStatus.OK)
  async saveProgress(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
    @Body() dto: SaveProgressDto,
  ) {
    return this.responseService.saveProgress(surveyId, req.user.userId, dto);
  }

  /**
   * Get existing response for the current respondent (resume in-progress).
   */
  @Get('mine')
  @Roles(UserRole.RESPONDENT)
  async getMyResponse(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
  ) {
    return this.responseService.getRespondentResponse(surveyId, req.user.userId);
  }

  /**
   * Get all responses for a survey with filters and pagination.
   * Only admins and above can view responses.
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async getResponses(
    @Param('surveyId') surveyId: string,
    @Query() filters: ResponseFilterDto,
  ) {
    return this.responseService.getResponses(surveyId, filters);
  }

  /**
   * Get manual reward recipients for a survey.
   * Only admins can view reward recipients.
   */
  @Get('manual-rewards')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getManualRewardRecipients(@Param('surveyId') surveyId: string) {
    return this.responseService.getManualRewardRecipients(surveyId);
  }

  /**
   * Mark rewards as distributed for respondents (individual or bulk).
   * Only admins can distribute rewards.
   */
  @Put('manual-rewards/distribute')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async markRewardDistributed(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
    @Body() dto: MarkRewardDistributedDto,
  ) {
    return this.responseService.markRewardDistributed(
      surveyId,
      dto.respondentIds,
      req.user.userId,
    );
  }
}
