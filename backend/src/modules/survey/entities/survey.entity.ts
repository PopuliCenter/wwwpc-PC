import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { SurveyStatus } from '@shared/enums';
import { User } from '@modules/auth/entities';
import { SurveyTimeConfig } from './survey-time-config.entity';
import { SurveyRewardConfig } from './survey-reward-config.entity';

export type RewardMode = 'automatic' | 'manual';

/**
 * Mode tampilan form pengisian:
 * - `paginated`: beberapa pertanyaan per halaman (perilaku default lama)
 * - `scroll`: semua pertanyaan dalam satu halaman scroll
 * - `wizard`: satu pertanyaan per langkah (gaya survei lapangan)
 */
export type FormMode = 'paginated' | 'scroll' | 'wizard';

/** Tipe survei (mengikuti referensi): nasional, daerah, atau lainnya. */
export type SurveyType = 'nasional' | 'daerah' | 'lainnya';

@Entity('survey')
export class Survey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: SurveyStatus,
    default: SurveyStatus.DRAFT,
  })
  status: SurveyStatus;

  @Column({
    type: 'enum',
    enum: ['automatic', 'manual'],
    enumName: 'reward_mode_enum',
    name: 'reward_mode',
    default: 'automatic',
  })
  rewardMode: RewardMode;

  @Column({ type: 'timestamptz', nullable: true, name: 'start_datetime' })
  startDatetime: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'end_datetime' })
  endDatetime: Date | null;

  @Column({ type: 'int', nullable: true, name: 'max_duration_minutes' })
  maxDurationMinutes: number | null;

  @Column({ type: 'int', nullable: true, name: 'max_respondents' })
  maxRespondents: number | null;

  @Column({ type: 'boolean', default: false, name: 'randomize_options' })
  randomizeOptions: boolean;

  @Column({
    type: 'enum',
    enum: ['paginated', 'scroll', 'wizard'],
    enumName: 'survey_form_mode_enum',
    name: 'form_mode',
    default: 'paginated',
  })
  formMode: FormMode;

  @Column({
    type: 'enum',
    enum: ['nasional', 'daerah', 'lainnya'],
    enumName: 'survey_type_enum',
    name: 'survey_type',
    default: 'lainnya',
  })
  surveyType: SurveyType;

  /** Kategori tematik survei (mis. Politik, Ekonomi, Sosial, Kesehatan). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  /**
   * Setelan alat pendukung (bukan tipe pertanyaan):
   * - `captureGps`: rekam lokasi GPS otomatis di awal & akhir pengisian.
   * - `requireSignature`: minta tanda tangan responden di akhir pengisian.
   */
  @Column({ type: 'boolean', default: false, name: 'capture_gps' })
  captureGps: boolean;

  @Column({ type: 'boolean', default: false, name: 'require_signature' })
  requireSignature: boolean;

  /** Bila aktif, jawaban teks responden dijadikan HURUF BESAR (uppercase). */
  @Column({ type: 'boolean', default: false, name: 'uppercase_answers' })
  uppercaseAnswers: boolean;

  /**
   * Targeting/kelayakan responden (kosong = tanpa batasan):
   * - `allowedGenders`: daftar gender yang boleh mengisi (male/female/other).
   * - `allowedProvinces`: daftar nama provinsi yang boleh mengisi.
   * Kuota total memakai `maxRespondents`.
   */
  @Column({ type: 'jsonb', name: 'allowed_genders', default: () => "'[]'" })
  allowedGenders: string[];

  @Column({ type: 'jsonb', name: 'allowed_provinces', default: () => "'[]'" })
  allowedProvinces: string[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt: Date | null;

  @OneToOne(() => SurveyTimeConfig, (config) => config.survey, {
    cascade: true,
    eager: true,
  })
  timeConfig: SurveyTimeConfig;

  @OneToOne(() => SurveyRewardConfig, (config) => config.survey, {
    cascade: true,
    eager: true,
  })
  rewardConfig: SurveyRewardConfig;
}
