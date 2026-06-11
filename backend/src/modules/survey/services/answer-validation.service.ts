import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../entities/question.entity';
import { QuestionType } from '@shared/enums';
import { VisibilityService } from './visibility.service';

export interface AnswerInput {
  questionId: string;
  value: any;
}

export interface ValidateOptions {
  respondentId: string;
  /** Enforce that all required (and visible) questions are answered. Use on final submit. */
  enforceRequired: boolean;
  /** Enforce per-type/format/range/option validation. Use on final submit. */
  enforceTypes: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indonesian phone numbers (without country code prefix logic) — 8–15 digits.
const PHONE_RE = /^[0-9]{8,15}$/;

/**
 * Server-side validation of survey answers. The frontend performs the same
 * checks for UX, but they MUST be re-validated here because the client is
 * untrusted — otherwise bots/scripts can submit malformed or fabricated data.
 */
@Injectable()
export class AnswerValidationService {
  private readonly logger = new Logger(AnswerValidationService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    private readonly visibilityService: VisibilityService,
  ) {}

  async validate(
    surveyId: string,
    answers: AnswerInput[],
    options: ValidateOptions,
  ): Promise<void> {
    const questions = await this.questionRepository.find({
      // Pertanyaan nonaktif diabaikan saat validasi (tidak ditampilkan ke responden)
      where: { surveyId, enabled: true },
      relations: ['options'],
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    const errors: string[] = [];
    const answerMap: Record<string, any> = {};

    // 1) Validate every provided answer ----------------------------------------
    for (const answer of answers) {
      const question = byId.get(answer.questionId);

      // Reject answers that do not belong to this survey — prevents a respondent
      // from injecting answers tied to questions from other surveys.
      if (!question) {
        errors.push(`Pertanyaan tidak dikenal pada survei ini (${answer.questionId})`);
        continue;
      }

      answerMap[answer.questionId] = answer.value;

      if (options.enforceTypes && !this.isEmpty(answer.value)) {
        const err = this.validateValueForType(question, answer.value, surveyId, options.respondentId);
        if (err) {
          errors.push(`"${this.short(question.questionText)}": ${err}`);
        }
      }
    }

    // 2) Required enforcement (visibility-aware) -------------------------------
    if (options.enforceRequired) {
      // A required question that is hidden by conditional-visibility rules must
      // NOT be enforced, otherwise legitimately-skipped questions would block
      // submission. Questions without rules default to visible.
      const visibility = await this.visibilityService.evaluateVisibility(
        surveyId,
        this.toConditionAnswers(answerMap),
      );

      for (const question of questions) {
        if (!question.required) continue;
        if (visibility[question.id] === false) continue; // hidden → skip
        if (this.isEmpty(answerMap[question.id])) {
          errors.push(`"${this.short(question.questionText)}": wajib diisi`);
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Validasi jawaban gagal',
        errors,
      });
    }
  }

  // ─── Per-type validation ────────────────────────────────────────────────────

  private validateValueForType(
    question: Question,
    value: any,
    surveyId: string,
    respondentId: string,
  ): string | null {
    const rules = question.validationRules ?? {};
    const optionValues = new Set((question.options ?? []).map((o) => o.value));

    switch (question.type) {
      case QuestionType.SINGLE_CHOICE:
      case QuestionType.DROPDOWN: {
        if (typeof value !== 'string') return 'jawaban harus berupa satu pilihan';
        if (!optionValues.has(value) && !question.hasOtherOption) {
          return 'pilihan tidak valid';
        }
        return null;
      }

      case QuestionType.MULTIPLE_CHOICE: {
        if (!Array.isArray(value)) return 'jawaban harus berupa daftar pilihan';
        if (value.some((v) => typeof v !== 'string')) return 'pilihan tidak valid';
        if (!question.hasOtherOption && value.some((v) => !optionValues.has(v))) {
          return 'terdapat pilihan yang tidak valid';
        }
        if (rules.maxCheckbox !== undefined && value.length > Number(rules.maxCheckbox)) {
          return `maksimal ${rules.maxCheckbox} pilihan`;
        }
        if (rules.minCheckbox !== undefined && value.length < Number(rules.minCheckbox)) {
          return `minimal ${rules.minCheckbox} pilihan`;
        }
        return null;
      }

      case QuestionType.SHORT_TEXT:
      case QuestionType.LONG_TEXT: {
        if (typeof value !== 'string') return 'jawaban harus berupa teks';
        if (rules.minLength !== undefined && value.length < Number(rules.minLength)) {
          return `minimal ${rules.minLength} karakter`;
        }
        if (rules.maxLength !== undefined && value.length > Number(rules.maxLength)) {
          return `maksimal ${rules.maxLength} karakter`;
        }
        if (rules.emailFormat && !EMAIL_RE.test(value)) return 'format email tidak valid';
        if (rules.phoneFormat && !PHONE_RE.test(value.replace(/\s/g, ''))) {
          return 'format nomor telepon tidak valid';
        }
        return null;
      }

      case QuestionType.PHONE_NUMBER: {
        if (typeof value !== 'string') return 'nomor telepon harus berupa teks';
        if (!PHONE_RE.test(value.replace(/\s/g, ''))) return 'format nomor telepon tidak valid';
        return null;
      }

      case QuestionType.NUMERIC_SCALE: {
        const num = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(num)) return 'jawaban harus berupa angka';
        const range = rules.numericRange ?? {};
        const min = range.min ?? rules.min;
        const max = range.max ?? rules.max;
        if (min !== undefined && num < Number(min)) return `nilai minimal ${min}`;
        if (max !== undefined && num > Number(max)) return `nilai maksimal ${max}`;
        return null;
      }

      case QuestionType.MATRIX_LIKERT: {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return 'jawaban matriks tidak valid';
        }
        const allStrings = Object.values(value).every((v) => typeof v === 'string');
        if (!allStrings) return 'jawaban matriks tidak valid';
        return null;
      }

      case QuestionType.DATE_TIME: {
        if (typeof value !== 'string') return 'tanggal tidak valid';
        if (Number.isNaN(Date.parse(value))) return 'format tanggal tidak valid';
        return null;
      }

      case QuestionType.FILE_UPLOAD: {
        if (typeof value !== 'string') return 'unggahan berkas tidak valid';
        // The value must be an object key produced by the upload endpoint for
        // THIS respondent on THIS survey — prevents referencing arbitrary keys.
        const expectedPrefix = `survey-uploads/${surveyId}/${respondentId}/`;
        if (!value.startsWith(expectedPrefix)) {
          return 'referensi berkas tidak valid';
        }
        return null;
      }

      case QuestionType.DATE: {
        if (typeof value !== 'string') return 'tanggal tidak valid';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
          return 'format tanggal tidak valid (YYYY-MM-DD)';
        }
        return null;
      }

      case QuestionType.RATING_SCALE: {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isInteger(num) || Number.isNaN(num)) return 'rating harus berupa bilangan bulat';
        const ratingMax = Number(rules.ratingMax ?? 5);
        if (num < 1 || num > ratingMax) return `rating harus antara 1 dan ${ratingMax}`;
        return null;
      }

      case QuestionType.UNIQUE_ID: {
        if (typeof value !== 'string') return 'ID unik harus berupa teks';
        if (!/^\d+$/.test(value)) return 'ID unik hanya boleh berisi angka';
        const minLen = Number(rules.minLength ?? 1);
        const maxLen = Number(rules.maxLength ?? 20);
        if (value.length < minLen) return `minimal ${minLen} digit`;
        if (value.length > maxLen) return `maksimal ${maxLen} digit`;
        return null;
      }

      case QuestionType.INDONESIA_REGION: {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return 'data wilayah tidak valid';
        }
        const regionDepth = (rules.regionDepth as string) ?? 'village';
        const depths = ['province', 'regency', 'district', 'village'];
        const requiredDepth = depths.indexOf(regionDepth);
        const depthFields: Record<number, [string, string]> = {
          0: ['province_id', 'province_name'],
          1: ['regency_id', 'regency_name'],
          2: ['district_id', 'district_name'],
          3: ['village_id', 'village_name'],
        };
        for (let i = 0; i <= requiredDepth; i++) {
          const [idField, nameField] = depthFields[i];
          if (!value[idField] || !value[nameField]) {
            const depthLabels = ['provinsi', 'kabupaten/kota', 'kecamatan', 'kelurahan/desa'];
            return `${depthLabels[i]} wajib dipilih`;
          }
        }
        return null;
      }

      default:
        return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private isEmpty(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /** Coerce the answer map into the shape evaluateVisibility expects. */
  private toConditionAnswers(
    answerMap: Record<string, any>,
  ): Record<string, string | number | string[]> {
    const result: Record<string, string | number | string[]> = {};
    for (const [key, val] of Object.entries(answerMap)) {
      if (Array.isArray(val)) {
        result[key] = val.map((v) => String(v));
      } else if (val !== null && val !== undefined && typeof val !== 'object') {
        result[key] = val as string | number;
      } else if (val && typeof val === 'object') {
        // Matrix answers can't drive visibility conditions — stringify defensively.
        result[key] = JSON.stringify(val);
      }
    }
    return result;
  }

  private short(text: string): string {
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }
}
