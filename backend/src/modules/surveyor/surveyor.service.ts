import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SurveyorQuota } from '@modules/survey/entities/surveyor-quota.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities';
import {
  SurveyResponse,
  ResponseStatus,
} from '@modules/response/entities/survey-response.entity';
import { Answer } from '@modules/response/entities/answer.entity';
import { SurveyFillService } from '@modules/survey/services/survey-fill.service';
import { AnswerValidationService } from '@modules/survey/services/answer-validation.service';
import { UserRole } from '@shared/enums';
import { AssignSurveyorDto } from './dto/assign-surveyor.dto';
import { UpdateSurveyorQuotaDto } from './dto/update-surveyor-quota.dto';
import { SubmitSurveyorResponseDto } from './dto/submit-surveyor-response.dto';

export interface SurveyorAssignmentView {
  surveyorId: string;
  surveyorName: string;
  surveyorEmail: string;
  quota: number | null;
  assignedNumbers: string[];
  usedCount: number;
  remaining: number | null;
}

export interface MySurveyView {
  surveyId: string;
  title: string;
  description: string;
  quota: number | null;
  usedCount: number;
  remaining: number | null;
  assignedNumberCount: number;
}

@Injectable()
export class SurveyorService {
  private readonly logger = new Logger(SurveyorService.name);

  constructor(
    @InjectRepository(SurveyorQuota)
    private readonly quotaRepository: Repository<SurveyorQuota>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    private readonly surveyFillService: SurveyFillService,
    private readonly answerValidationService: AnswerValidationService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Admin ────────────────────────────────────────────────────────────────

  async assignSurveyor(
    surveyId: string,
    dto: AssignSurveyorDto,
  ): Promise<SurveyorQuota> {
    await this.assertSurveyExists(surveyId);

    const user = await this.userRepository.findOne({
      where: { id: dto.surveyorId },
    });
    if (!user) {
      throw new NotFoundException('Pengguna surveyor tidak ditemukan');
    }
    if (user.role !== UserRole.SURVEYOR) {
      throw new BadRequestException(
        'Pengguna yang ditugaskan harus memiliki role surveyor',
      );
    }

    const existing = await this.quotaRepository.findOne({
      where: { surveyId, surveyorId: dto.surveyorId },
    });
    if (existing) {
      throw new ConflictException('Surveyor sudah ditugaskan pada survei ini');
    }

    const numbers = this.dedupe(dto.assignedNumbers ?? []);
    await this.assertNumbersFree(surveyId, numbers);

    const quota = this.quotaRepository.create({
      surveyId,
      surveyorId: dto.surveyorId,
      quota: dto.quota ?? null,
      assignedNumbers: numbers,
    });
    const saved = await this.quotaRepository.save(quota);
    this.logger.log(
      `Surveyor ${dto.surveyorId} ditugaskan ke survei ${surveyId}`,
    );
    return saved;
  }

  /** Daftar pengguna ber-role surveyor yang BELUM ditugaskan ke survei ini. */
  async listAvailableSurveyors(
    surveyId: string,
  ): Promise<Array<{ id: string; fullName: string; email: string }>> {
    const assigned = await this.quotaRepository.find({
      where: { surveyId },
      select: ['surveyorId'],
    });
    const assignedIds = new Set(assigned.map((a) => a.surveyorId));
    const users = await this.userRepository.find({
      where: { role: UserRole.SURVEYOR },
      order: { fullName: 'ASC' },
    });
    return users
      .filter((u) => !assignedIds.has(u.id))
      .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }));
  }

  async listSurveyors(surveyId: string): Promise<SurveyorAssignmentView[]> {
    await this.assertSurveyExists(surveyId);
    const quotas = await this.quotaRepository.find({
      where: { surveyId },
      relations: ['surveyor'],
      order: { createdAt: 'ASC' },
    });

    return Promise.all(
      quotas.map(async (q) => {
        const usedCount = await this.responseRepository.count({
          where: { surveyId, surveyorId: q.surveyorId },
        });
        return {
          surveyorId: q.surveyorId,
          surveyorName: q.surveyor?.fullName ?? '-',
          surveyorEmail: q.surveyor?.email ?? '-',
          quota: q.quota,
          assignedNumbers: q.assignedNumbers ?? [],
          usedCount,
          remaining: q.quota != null ? Math.max(q.quota - usedCount, 0) : null,
        };
      }),
    );
  }

  async updateQuota(
    surveyId: string,
    surveyorId: string,
    dto: UpdateSurveyorQuotaDto,
  ): Promise<SurveyorQuota> {
    const quota = await this.getAssignmentOrThrow(surveyId, surveyorId);
    if (dto.quota !== undefined) quota.quota = dto.quota;
    if (dto.assignedNumbers !== undefined) {
      const numbers = this.dedupe(dto.assignedNumbers);
      await this.assertNumbersFree(surveyId, numbers, surveyorId);
      quota.assignedNumbers = numbers;
    }
    return this.quotaRepository.save(quota);
  }

  async assignNumbers(
    surveyId: string,
    surveyorId: string,
    numbers: string[],
  ): Promise<SurveyorQuota> {
    const quota = await this.getAssignmentOrThrow(surveyId, surveyorId);
    const toAdd = this.dedupe(numbers).filter(
      (n) => !quota.assignedNumbers.includes(n),
    );
    await this.assertNumbersFree(surveyId, toAdd, surveyorId);
    quota.assignedNumbers = [...quota.assignedNumbers, ...toAdd];
    return this.quotaRepository.save(quota);
  }

  async removeSurveyor(surveyId: string, surveyorId: string): Promise<void> {
    const quota = await this.getAssignmentOrThrow(surveyId, surveyorId);
    await this.quotaRepository.remove(quota);
    this.logger.log(
      `Surveyor ${surveyorId} dilepas dari survei ${surveyId}`,
    );
  }

  // ─── Surveyor ───────────────────────────────────────────────────────────────

  async getMySurveys(surveyorId: string): Promise<MySurveyView[]> {
    const quotas = await this.quotaRepository.find({
      where: { surveyorId },
      relations: ['survey'],
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      quotas.map(async (q) => {
        const usedCount = await this.responseRepository.count({
          where: { surveyId: q.surveyId, surveyorId },
        });
        return {
          surveyId: q.surveyId,
          title: q.survey?.title ?? '-',
          description: q.survey?.description ?? '',
          quota: q.quota,
          usedCount,
          remaining: q.quota != null ? Math.max(q.quota - usedCount, 0) : null,
          assignedNumberCount: (q.assignedNumbers ?? []).length,
        };
      }),
    );
  }

  async getMyNumbers(
    surveyId: string,
    surveyorId: string,
  ): Promise<Array<{ number: string; used: boolean }>> {
    const quota = await this.getAssignmentOrThrow(surveyId, surveyorId);
    const used = await this.getUsedNumbers(surveyId);
    return (quota.assignedNumbers ?? []).map((number) => ({
      number,
      used: used.has(number),
    }));
  }

  async getFillData(surveyId: string, surveyorId: string) {
    await this.getAssignmentOrThrow(surveyId, surveyorId);
    return this.surveyFillService.getSurveyorFillData(surveyId);
  }

  async submitResponse(
    surveyId: string,
    surveyorId: string,
    dto: SubmitSurveyorResponseDto,
  ): Promise<{ id: string; questionnaireNumber: string }> {
    const quota = await this.getAssignmentOrThrow(surveyId, surveyorId);

    const number = dto.questionnaireNumber.trim();
    if (!quota.assignedNumbers.includes(number)) {
      throw new BadRequestException(
        'Nomor kuesioner tidak termasuk dalam alokasi Anda',
      );
    }

    // Nomor harus belum dipakai pada survei ini.
    const usedByNumber = await this.responseRepository.findOne({
      where: { surveyId, questionnaireNumber: number },
    });
    if (usedByNumber) {
      throw new ConflictException('Nomor kuesioner ini sudah dipakai');
    }

    // Validasi jawaban (wajib + tipe) — otoritatif di server.
    await this.answerValidationService.validate(surveyId, dto.answers, {
      respondentId: surveyorId,
      enforceRequired: true,
      enforceTypes: true,
    });

    const responseId = await this.dataSource.transaction(async (manager) => {
      const response = manager.create(SurveyResponse, {
        surveyId,
        respondentId: surveyorId,
        surveyorId,
        questionnaireNumber: number,
        status: ResponseStatus.COMPLETE,
        deviceType: dto.deviceType || null,
        startedAt: new Date(),
        submittedAt: new Date(),
        startLatitude: dto.startLatitude ?? null,
        startLongitude: dto.startLongitude ?? null,
        endLatitude: dto.endLatitude ?? null,
        endLongitude: dto.endLongitude ?? null,
      });
      const saved = await manager.save(response);

      if (dto.answers.length > 0) {
        const answerEntities = dto.answers.map((a) =>
          manager.create(Answer, {
            responseId: saved.id,
            questionId: a.questionId,
            value: a.value,
            answeredAt: new Date(),
          }),
        );
        await manager.save(answerEntities);
      }
      return saved.id;
    });

    this.logger.log(
      `Surveyor ${surveyorId} submit kuesioner #${number} survei ${surveyId}`,
    );
    return { id: responseId, questionnaireNumber: number };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private dedupe(arr: string[]): string[] {
    return [...new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0))];
  }

  private async assertSurveyExists(surveyId: string): Promise<void> {
    const count = await this.surveyRepository.count({
      where: { id: surveyId },
    });
    if (count === 0) {
      throw new NotFoundException(`Survei ${surveyId} tidak ditemukan`);
    }
  }

  private async getAssignmentOrThrow(
    surveyId: string,
    surveyorId: string,
  ): Promise<SurveyorQuota> {
    const quota = await this.quotaRepository.findOne({
      where: { surveyId, surveyorId },
    });
    if (!quota) {
      throw new NotFoundException(
        'Surveyor tidak ditugaskan pada survei ini',
      );
    }
    return quota;
  }

  /** Nomor kuesioner yang sudah dipakai (ada respons) pada survei. */
  private async getUsedNumbers(surveyId: string): Promise<Set<string>> {
    const rows = await this.responseRepository.find({
      where: { surveyId },
      select: ['questionnaireNumber'],
    });
    return new Set(
      rows
        .map((r) => r.questionnaireNumber)
        .filter((n): n is string => !!n),
    );
  }

  /**
   * Pastikan nomor belum dialokasikan ke surveyor LAIN pada survei yang sama
   * (nomor kuesioner unik per survei).
   */
  private async assertNumbersFree(
    surveyId: string,
    numbers: string[],
    exceptSurveyorId?: string,
  ): Promise<void> {
    if (numbers.length === 0) return;
    const others = await this.quotaRepository.find({ where: { surveyId } });
    const taken = new Set<string>();
    for (const q of others) {
      if (exceptSurveyorId && q.surveyorId === exceptSurveyorId) continue;
      for (const n of q.assignedNumbers ?? []) taken.add(n);
    }
    const clash = numbers.filter((n) => taken.has(n));
    if (clash.length > 0) {
      throw new ConflictException(
        `Nomor sudah dialokasikan ke surveyor lain: ${clash.join(', ')}`,
      );
    }
  }
}
