import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SurveyFillService } from './survey-fill.service';
import { QuestionOrderService } from './question-order.service';
import { ResponseStatus } from '@modules/response/entities/survey-response.entity';

const SURVEY_ID = 'survey-1';
const RESPONDENT_ID = 'resp-1';

function buildSurvey(overrides: Record<string, any> = {}) {
  return {
    id: SURVEY_ID,
    title: 'Survei Kepuasan',
    description: 'Deskripsi survei',
    rewardMode: 'automatic',
    randomizeOptions: false,
    maxDurationMinutes: null,
    timeConfig: { maxDurationMinutes: 20 },
    rewardConfig: { pointsValue: 100 },
    ...overrides,
  };
}

interface Mocks {
  survey?: any;
  existingResponse?: any;
  pages?: any[];
  questions?: any[];
  skipRules?: any[];
  visibilityRules?: any[];
  armQuestions?: any[];
  armAnswers?: any[];
  profileCompleted?: boolean;
  phone?: string | null;
  access?: { allowed: boolean; reason?: string } | (() => never);
}

function makeService(m: Mocks = {}) {
  const surveyRepository = {
    findOne: vi.fn().mockResolvedValue('survey' in m ? m.survey : buildSurvey()),
  };
  const pageRepository = { find: vi.fn().mockResolvedValue(m.pages ?? []) };
  // find() peka pada filter `where.type`: kueri arm (random_arm) mengembalikan
  // m.armQuestions, selain itu daftar pertanyaan biasa.
  const questionRepository = {
    find: vi.fn().mockImplementation((opts: any) => {
      if (opts?.where?.type === 'random_arm') {
        return Promise.resolve(m.armQuestions ?? []);
      }
      return Promise.resolve(m.questions ?? []);
    }),
  };
  const skipLogicRepository = { find: vi.fn().mockResolvedValue(m.skipRules ?? []) };
  const visibilityRepository = { find: vi.fn().mockResolvedValue(m.visibilityRules ?? []) };
  // assertProfileCompleted() + assertEligible() membaca via raw query. Default
  // profil lengkap kecuali test mengeset m.profileCompleted = false.
  const profileCompleted = m.profileCompleted ?? true;
  const phone = 'phone' in m ? m.phone : '08123456789';
  const responseRepository = {
    findOne: vi.fn().mockResolvedValue(m.existingResponse ?? null),
    create: vi.fn().mockImplementation((data: any) => data),
    save: vi.fn().mockImplementation((data: any) => Promise.resolve({ id: 'resp-new', ...data })),
    manager: {
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('profile_completed')) {
          return Promise.resolve([{ profile_completed: profileCompleted, phone }]);
        }
        return Promise.resolve([]);
      }),
    },
  };
  const insertExecute = vi.fn().mockResolvedValue({});
  const answerRepository = {
    find: vi.fn().mockResolvedValue(m.armAnswers ?? []),
    create: vi.fn().mockImplementation((data: any) => data),
    createQueryBuilder: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: insertExecute,
    }),
  };
  const surveyTimeService = {
    checkSurveyAccess: vi.fn().mockImplementation(async () => {
      if (typeof m.access === 'function') return m.access();
      return m.access ?? { allowed: true };
    }),
  };

  const service = new SurveyFillService(
    surveyRepository as any,
    pageRepository as any,
    questionRepository as any,
    skipLogicRepository as any,
    visibilityRepository as any,
    responseRepository as any,
    answerRepository as any,
    surveyTimeService as any,
    // Layanan murni tanpa dependensi — pakai yang asli agar urutan yang diuji nyata.
    new QuestionOrderService(),
  );

  return { service, surveyRepository, responseRepository, answerRepository, surveyTimeService };
}

describe('SurveyFillService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundException when the survey does not exist', async () => {
    const { service } = makeService({ survey: null });
    await expect(service.getFillData(SURVEY_ID, RESPONDENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when the respondent already completed the survey', async () => {
    const { service } = makeService({
      existingResponse: { id: 'resp-x', status: ResponseStatus.COMPLETE },
    });
    await expect(service.getFillData(SURVEY_ID, RESPONDENT_ID)).rejects.toThrow(ConflictException);
  });

  it('creates a new in-progress response and aggregates fill data', async () => {
    const { service, responseRepository, surveyTimeService } = makeService({
      pages: [
        { id: 'page-1', pageNumber: 1 },
        { id: 'page-2', pageNumber: 2 },
      ],
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          questionText: 'Pilih satu',
          required: true,
          orderIndex: 0,
          pageId: 'page-1',
          validationRules: null,
          options: [
            { id: 'o2', label: 'B', value: 'b', orderIndex: 1 },
            { id: 'o1', label: 'A', value: 'a', orderIndex: 0 },
          ],
        },
        {
          id: 'q2',
          type: 'numeric_scale',
          questionText: 'Skala',
          required: false,
          orderIndex: 1,
          pageId: 'page-2',
          validationRules: { numericRange: { min: 1, max: 5 } },
          options: [],
        },
      ],
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);

    // New response was created (access checked because none existed)
    expect(surveyTimeService.checkSurveyAccess).toHaveBeenCalledWith(SURVEY_ID);
    expect(responseRepository.save).toHaveBeenCalled();
    expect(result.responseId).toBe('resp-new');

    expect(result.id).toBe(SURVEY_ID);
    expect(result.title).toBe('Survei Kepuasan');
    expect(result.totalPages).toBe(2);
    expect(result.maxDuration).toBe(20);
    expect(result.rewardMode).toBe('auto_point');
    expect(result.rewardPoints).toBe(100);

    // Question mapping
    const q1 = result.questions[0];
    expect(q1.text).toBe('Pilih satu');
    expect(q1.page).toBe(1);
    expect(q1.options?.map((o) => o.value)).toEqual(['a', 'b']); // sorted by orderIndex
    const q2 = result.questions[1];
    expect(q2.page).toBe(2);
    expect(q2.scaleMin).toBe(1);
    expect(q2.scaleMax).toBe(5);
  });

  it('resumes an existing in-progress response without re-checking access', async () => {
    const { service, responseRepository, surveyTimeService } = makeService({
      existingResponse: { id: 'resp-existing', status: ResponseStatus.IN_PROGRESS },
      questions: [],
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);

    expect(result.responseId).toBe('resp-existing');
    expect(surveyTimeService.checkSurveyAccess).not.toHaveBeenCalled();
    expect(responseRepository.save).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when access is denied for a new respondent', async () => {
    const { service } = makeService({
      access: { allowed: false, reason: 'Survey has ended' },
    });
    await expect(service.getFillData(SURVEY_ID, RESPONDENT_ID)).rejects.toThrow(ForbiddenException);
  });

  it('allows access when no time config exists (checkSurveyAccess throws NotFound)', async () => {
    const { service, responseRepository } = makeService({
      access: () => {
        throw new NotFoundException('Time configuration for survey not found');
      },
      questions: [],
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);
    expect(result.responseId).toBe('resp-new');
    expect(responseRepository.save).toHaveBeenCalled();
  });

  it('maps a manual reward description', async () => {
    const { service } = makeService({
      survey: buildSurvey({
        rewardMode: 'manual',
        rewardConfig: { manualRewardType: 'Pulsa', manualRewardNominal: 50000 },
      }),
      questions: [],
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);
    expect(result.rewardMode).toBe('manual');
    expect(result.rewardPoints).toBeUndefined();
    expect(result.rewardDescription).toContain('Pulsa');
    expect(result.rewardDescription).toContain('50.000');
  });

  it('maps skip rules and inverts hide-visibility rules', async () => {
    const { service } = makeService({
      questions: [
        {
          id: 'q2',
          type: 'short_text',
          questionText: 'Bersyarat',
          required: false,
          orderIndex: 0,
          pageId: 'page-1',
          validationRules: null,
          options: [],
        },
      ],
      skipRules: [
        {
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'no',
          action: 'skip',
        },
        {
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'jump',
          action: 'jump_to',
        },
      ],
      visibilityRules: [
        {
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'hidden',
          visibilityAction: 'hide',
        },
      ],
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);
    const q = result.questions[0];

    // Only the 'skip' action is mapped (jump_to is ignored di sisi kondisi klien)
    expect(q.skipConditions).toEqual([{ questionId: 'q1', operator: 'equals', value: 'no' }]);
    // Aturan 'hide' TIDAK diinversikan — dipetakan apa adanya ke hideConditions
    // (M8); visibilityConditions hanya berisi aturan 'show'.
    expect(q.visibilityConditions).toEqual([]);
    expect(q.hideConditions).toEqual([{ questionId: 'q1', operator: 'equals', value: 'hidden' }]);
  });

  it('blocks filling with 403 when the respondent profile is not completed', async () => {
    const { service } = makeService({ profileCompleted: false });

    await expect(service.getFillData(SURVEY_ID, RESPONDENT_ID)).rejects.toThrow(
      /Lengkapi data diri/i,
    );
  });

  it('blocks filling with 403 when the respondent has no phone number', async () => {
    const { service } = makeService({ profileCompleted: true, phone: null });

    await expect(service.getFillData(SURVEY_ID, RESPONDENT_ID)).rejects.toThrow(/nomor telepon/i);
  });

  it('assigns a random experiment arm, hides it from rendered questions, and persists it', async () => {
    const armQuestion = {
      id: 'arm-1',
      type: 'random_arm',
      questionText: 'Kelompok eksperimen',
      required: false,
      enabled: true,
      options: [
        { id: 'o1', label: 'Kelompok 1', value: '1', orderIndex: 0 },
        { id: 'o2', label: 'Kelompok 2', value: '2', orderIndex: 1 },
      ],
    };
    const { service, answerRepository } = makeService({
      // Daftar render TIDAK memuat arm (akan difilter); arm dikueri terpisah.
      questions: [armQuestion],
      armQuestions: [armQuestion],
      armAnswers: [], // belum ada penugasan → harus diundi
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);

    // Arm tidak dirender ke responden.
    expect(result.questions.find((q) => q.type === 'random_arm')).toBeUndefined();
    // Penugasan dikembalikan & valid (salah satu kode kelompok).
    expect(['1', '2']).toContain(result.assignments?.['arm-1']);
    // Penugasan disimpan sebagai jawaban (insert dijalankan).
    expect(answerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'arm-1', responseId: expect.any(String) }),
    );
    expect(answerRepository.createQueryBuilder).toHaveBeenCalled();
  });

  it('reuses an existing arm assignment instead of re-rolling on resume', async () => {
    const armQuestion = {
      id: 'arm-1',
      type: 'random_arm',
      questionText: 'Kelompok eksperimen',
      required: false,
      enabled: true,
      options: [
        { id: 'o1', label: 'Kelompok 1', value: '1', orderIndex: 0 },
        { id: 'o2', label: 'Kelompok 2', value: '2', orderIndex: 1 },
      ],
    };
    const { service, answerRepository } = makeService({
      existingResponse: { id: 'resp-existing', status: ResponseStatus.IN_PROGRESS },
      questions: [armQuestion],
      armQuestions: [armQuestion],
      armAnswers: [{ questionId: 'arm-1', value: '2' }], // sudah ada → pakai ulang
    });

    const result = await service.getFillData(SURVEY_ID, RESPONDENT_ID);

    expect(result.assignments?.['arm-1']).toBe('2');
    // Tidak ada penyisipan baru karena penugasan sudah ada.
    expect(answerRepository.create).not.toHaveBeenCalled();
  });
});
