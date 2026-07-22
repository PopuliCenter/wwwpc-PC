import type { ImportedQuestion } from './questionImportExport';

/**
 * Tipe domain EDITOR survei (sisi admin). Berbeda dari tipe pengisian responden
 * (@/types/survey) — model edit punya order/enabled/validationRules/skipLogicRules.
 * Dipisah agar bisa dipakai bersama komponen editor yang dipecah ke file sendiri.
 */

// Selaras dengan enum QuestionType backend.
export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'short_text'
  | 'long_text'
  | 'phone_number'
  | 'numeric_scale'
  | 'dropdown'
  | 'matrix_likert'
  | 'file_upload'
  | 'date_time'
  | 'date'
  | 'rating_scale'
  | 'unique_id'
  | 'random_arm'
  | 'indonesia_region'
  | 'signature'
  | 'photo'
  | 'gps'
  | 'audio';

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  order: number;
}

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

export interface SkipLogicRule {
  sourceQuestionId: string;
  operator: ConditionOperator;
  conditionValue: string;
  action: 'skip' | 'jump_to';
  targetQuestionId?: string;
}

export interface VisibilityRule {
  sourceQuestionId: string;
  operator: ConditionOperator;
  conditionValue: string;
  visibilityAction: 'show' | 'hide';
}

export interface ValidationRules {
  // Teks
  minLength?: number;
  maxLength?: number;
  emailFormat?: boolean;
  phoneFormat?: boolean;
  regex?: string;
  // Numeric
  numericRange?: { min?: number; max?: number };
  // Pilihan
  maxCheckbox?: number;
  minCheckbox?: number;
  /** Acak urutan opsi saat ditampilkan ke responden ("Lainnya" tetap di bawah). */
  randomizeOptions?: boolean;
  // Matrix
  matrixRows?: string[];
  matrixColumns?: string[];
  // Rating Scale
  ratingMax?: number;
  ratingDisplayMode?: 'star' | 'number';
  ratingMinLabel?: string;
  ratingMaxLabel?: string;
  // Wilayah
  regionDepth?: 'province' | 'regency' | 'district' | 'village';
  lockedProvince?: { id: string; name: string } | null;
  lockedRegency?: { id: string; name: string } | null;
  // Misc
  description?: string;
  scaleMin?: number;
  scaleMax?: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  /** true=tampil, false=nonaktif (tidak ditampilkan ke responden). Default true. */
  enabled?: boolean;
  order: number;
  hasOtherOption?: boolean;
  /** Nama blok acak; kosong/null = pertanyaan tidak ikut diacak. */
  randomizeGroup?: string | null;
  /** Tetap di posisinya meski bloknya diacak. */
  pinPosition?: boolean;
  options?: QuestionOption[];
  skipLogicRules?: SkipLogicRule[];
  visibilityRules?: VisibilityRule[];
  validationRules?: ValidationRules;
}

export interface SurveyDetail {
  id: string;
  title: string;
  description: string;
  surveyType: 'nasional' | 'daerah' | 'lainnya';
  category: string | null;
  formMode: 'paginated' | 'scroll' | 'wizard';
  captureGps: boolean;
  requireSignature: boolean;
  questions: Question[];
}

// Bentuk pertanyaan dari backend (GET /surveys/:id/questions)
export interface BackendQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  required: boolean;
  enabled?: boolean;
  orderIndex: number;
  validationRules: ValidationRules | null;
  hasOtherOption: boolean;
  randomizeGroup?: string | null;
  pinPosition?: boolean;
  options?: { id: string; label: string; value: string; orderIndex: number }[];
  skipLogicRules?: SkipLogicRule[];
  visibilityRules?: VisibilityRule[];
}

/** Petakan bentuk backend → bentuk Question editor (memuat aturan skip/visibilitas). */
export function mapBackendQuestion(q: BackendQuestion, idx: number): Question {
  return {
    id: q.id,
    type: q.type,
    text: q.questionText ?? '',
    required: !!q.required,
    enabled: q.enabled !== false,
    order: q.orderIndex ?? idx,
    hasOtherOption: !!q.hasOtherOption,
    randomizeGroup: q.randomizeGroup ?? null,
    pinPosition: !!q.pinPosition,
    validationRules: q.validationRules ?? undefined,
    options: (q.options ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ id: o.id, label: o.label, value: o.value, order: o.orderIndex })),
    // Muat aturan skip/visibilitas agar logika tidak hilang saat survei diedit.
    skipLogicRules: (q.skipLogicRules ?? []).map((r) => ({
      sourceQuestionId: r.sourceQuestionId,
      operator: r.operator,
      conditionValue: r.conditionValue,
      action: r.action,
      targetQuestionId: r.targetQuestionId ?? undefined,
    })),
    visibilityRules: (q.visibilityRules ?? []).map((r) => ({
      sourceQuestionId: r.sourceQuestionId,
      operator: r.operator,
      conditionValue: r.conditionValue,
      visibilityAction: r.visibilityAction,
    })),
  };
}

/** Ubah pertanyaan hasil impor Excel → bentuk Question editor (order lanjut dari baseOrder). */
export function buildQuestionsFromImport(
  imported: ImportedQuestion[],
  baseOrder: number,
): Question[] {
  return imported.map((iq, i) => ({
    id: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    type: iq.type as QuestionType,
    text: iq.text,
    required: iq.required,
    enabled: true,
    order: baseOrder + i,
    hasOtherOption: iq.hasOtherOption,
    options: iq.options.map((o, oi) => ({
      id: `opt-${Date.now()}-${i}-${oi}`,
      label: o.label,
      value: o.value,
      order: oi,
    })),
    validationRules: iq.description ? { description: iq.description } : undefined,
  }));
}
