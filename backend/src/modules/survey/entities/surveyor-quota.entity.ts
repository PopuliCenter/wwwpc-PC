import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Survey } from './survey.entity';
import { User } from '@modules/auth/entities';

/**
 * Penugasan seorang surveyor (TPD) pada sebuah survei: berapa kuota target
 * pengisian dan daftar nomor kuesioner yang dialokasikan untuknya.
 */
@Entity('surveyor_quota')
@Unique('uq_surveyor_quota_survey_surveyor', ['surveyId', 'surveyorId'])
export class SurveyorQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'survey_id' })
  surveyId: string;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  @Column({ type: 'uuid', name: 'surveyor_id' })
  surveyorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surveyor_id' })
  surveyor: User;

  /** Target jumlah pengisian. null = tak terbatas. */
  @Column({ type: 'int', nullable: true })
  quota: number | null;

  /** Nomor kuesioner yang dialokasikan ke surveyor ini (unik per survei). */
  @Column({ type: 'jsonb', name: 'assigned_numbers', default: () => "'[]'" })
  assignedNumbers: string[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
