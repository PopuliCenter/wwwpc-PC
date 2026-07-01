import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AnswerValidationService } from './answer-validation.service';
import { QuestionType } from '@shared/enums';

const SURVEY_ID = 'survey-1';
const RESPONDENT_ID = 'resp-1';

function makeService(
  questions: any[],
  visibility: Record<string, boolean> = {},
  skipped: string[] = [],
) {
  const questionRepository = {
    find: vi.fn().mockResolvedValue(questions),
  };
  const visibilityService = {
    evaluateVisibility: vi.fn().mockResolvedValue(visibility),
  };
  const skipLogicService = {
    evaluateSkipLogic: vi.fn().mockResolvedValue(skipped),
  };
  const service = new AnswerValidationService(
    questionRepository as any,
    visibilityService as any,
    skipLogicService as any,
  );
  return { service, questionRepository, visibilityService, skipLogicService };
}

const submitOpts = { respondentId: RESPONDENT_ID, enforceRequired: true, enforceTypes: true };

describe('AnswerValidationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a valid single-choice answer', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        questionText: 'Pilih satu',
        required: true,
        options: [{ value: 'a' }, { value: 'b' }],
        validationRules: null,
        hasOtherOption: false,
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: 'a' }], submitOpts),
    ).resolves.toBeUndefined();
  });

  it('rejects a single-choice value not among the options', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        questionText: 'Pilih satu',
        required: false,
        options: [{ value: 'a' }, { value: 'b' }],
        validationRules: null,
        hasOtherOption: false,
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: 'zzz' }], submitOpts),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an answer for a question not in the survey', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SHORT_TEXT,
        questionText: 'A',
        required: false,
        options: [],
        validationRules: null,
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'ghost', value: 'x' }], submitOpts),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces required for visible questions', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SHORT_TEXT,
        questionText: 'Wajib',
        required: true,
        options: [],
        validationRules: null,
      },
    ]);

    await expect(service.validate(SURVEY_ID, [], submitOpts)).rejects.toThrow(BadRequestException);
  });

  it('skips required enforcement for questions hidden by visibility rules', async () => {
    const { service } = makeService(
      [
        {
          id: 'q1',
          type: QuestionType.SHORT_TEXT,
          questionText: 'Tersembunyi',
          required: true,
          options: [],
          validationRules: null,
        },
      ],
      { q1: false },
    );

    await expect(service.validate(SURVEY_ID, [], submitOpts)).resolves.toBeUndefined();
  });

  it('enforces maxCheckbox on multiple choice', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.MULTIPLE_CHOICE,
        questionText: 'Pilih',
        required: false,
        options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        validationRules: { maxCheckbox: 2 },
        hasOtherOption: false,
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: ['a', 'b', 'c'] }], submitOpts),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces numeric range on numeric_scale', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.NUMERIC_SCALE,
        questionText: 'Skala',
        required: false,
        options: [],
        validationRules: { numericRange: { min: 1, max: 5 } },
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: '9' }], submitOpts),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: '3' }], submitOpts),
    ).resolves.toBeUndefined();
  });

  it('rejects a file_upload value that is not owned by the respondent', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.FILE_UPLOAD,
        questionText: 'Berkas',
        required: false,
        options: [],
        validationRules: null,
      },
    ]);

    await expect(
      service.validate(
        SURVEY_ID,
        [{ questionId: 'q1', value: 'survey-uploads/other-survey/other-user/x.png' }],
        submitOpts,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.validate(
        SURVEY_ID,
        [{ questionId: 'q1', value: `survey-uploads/${SURVEY_ID}/${RESPONDENT_ID}/x.png` }],
        submitOpts,
      ),
    ).resolves.toBeUndefined();
  });

  it('does not enforce required or types in lenient (auto-save) mode', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SHORT_TEXT,
        questionText: 'Wajib',
        required: true,
        options: [],
        validationRules: { maxLength: 2 },
      },
    ]);

    await expect(
      service.validate(SURVEY_ID, [{ questionId: 'q1', value: 'too-long' }], {
        respondentId: RESPONDENT_ID,
        enforceRequired: false,
        enforceTypes: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not enforce required on a question skipped by skip-logic', async () => {
    const { service } = makeService(
      [
        {
          id: 'q1',
          type: QuestionType.SHORT_TEXT,
          questionText: 'Wajib tapi dilewati',
          required: true,
          options: [],
          validationRules: null,
          hasOtherOption: false,
        },
      ],
      {},
      ['q1'], // q1 dilewati oleh skip-logic
    );

    await expect(service.validate(SURVEY_ID, [], submitOpts)).resolves.toBeUndefined();
  });

  it('still enforces required on a non-skipped, visible question', async () => {
    const { service } = makeService([
      {
        id: 'q1',
        type: QuestionType.SHORT_TEXT,
        questionText: 'Wajib',
        required: true,
        options: [],
        validationRules: null,
        hasOtherOption: false,
      },
    ]);

    await expect(service.validate(SURVEY_ID, [], submitOpts)).rejects.toThrow(BadRequestException);
  });
});
