/**
 * Tipe domain PENGISIAN survei (sisi responden). Dipakai bersama oleh
 * SurveyFillPage dan komponen renderer pertanyaan yang dipisah ke file sendiri.
 *
 * Catatan: ini BENTUK TAMPIL/ISI (bukan bentuk edit admin). Sisi admin
 * (SurveyEditPage) memakai model Question yang berbeda (punya order, enabled,
 * validationRules, skipLogicRules) — sengaja TIDAK disatukan agar tak rapuh.
 */

export interface SurveyOption {
  id: string;
  label: string;
  value: string;
}

export interface SkipCondition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

export interface RegionConfig {
  regionDepth?: 'province' | 'regency' | 'district' | 'village';
  lockedProvince?: { id: string; name: string } | null;
  lockedRegency?: { id: string; name: string } | null;
}

export interface RatingConfig {
  ratingMax?: number;
  ratingDisplayMode?: 'star' | 'number';
  ratingMinLabel?: string;
  ratingMaxLabel?: string;
}

export interface Question {
  id: string;
  type:
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
    | 'indonesia_region'
    | 'signature'
    | 'photo'
    | 'gps'
    | 'audio';
  text: string;
  description?: string;
  required: boolean;
  options?: SurveyOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  scaleMin?: number;
  scaleMax?: number;
  randomizeOptions?: boolean;
  hasOtherOption?: boolean;
  skipConditions?: SkipCondition[];
  visibilityConditions?: SkipCondition[];
  page: number;
  regionConfig?: RegionConfig;
  ratingConfig?: RatingConfig;
  uniqueIdConfig?: { minLength?: number; maxLength?: number };
}

export interface SurveyFillData {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  totalPages: number;
  /** Mode tampilan form: paginated (default), scroll, atau wizard (1 pertanyaan/langkah). */
  formMode?: 'paginated' | 'scroll' | 'wizard';
  /** Rekam lokasi GPS otomatis (awal & akhir). Default false bila tak diset. */
  captureGps?: boolean;
  /** Minta tanda tangan responden di akhir pengisian. */
  requireSignature?: boolean;
  /** Jadikan jawaban teks (short_text/long_text) HURUF BESAR. */
  uppercaseAnswers?: boolean;
  maxDuration?: number; // in minutes
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  responseId: string;
  /**
   * Nilai pra-isi dari server (saat ini: penugasan acak / arm eksperimen),
   * questionId → nilai. Ditanam ke peta jawaban agar aturan tampil cabang jalan.
   */
  assignments?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnswerValue = string | string[] | Record<string, any> | null;

/** Props seragam untuk setiap komponen renderer pertanyaan. */
export interface RendererProps {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  surveyId: string;
  invalid?: boolean;
  /** Setelan survei: jadikan jawaban teks bebas HURUF BESAR saat diketik. */
  uppercase?: boolean;
}
