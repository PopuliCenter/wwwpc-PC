import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities';
import { Answer } from './answer.entity';

export enum ResponseStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETE = 'complete',
  ABANDONED = 'abandoned',
}

@Entity('survey_response')
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'survey_id' })
  surveyId: string;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  @Column({ type: 'uuid', name: 'respondent_id' })
  respondentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'respondent_id' })
  respondent: User;

  @Column({
    type: 'enum',
    enum: ResponseStatus,
    enumName: 'response_status_enum',
    default: ResponseStatus.IN_PROGRESS,
  })
  status: ResponseStatus;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'device_type' })
  deviceType: string | null;

  @Column({ type: 'timestamp', name: 'started_at', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'submitted_at' })
  submittedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'exported_at' })
  exportedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[] | null;

  // ── Reward per-respons (mode manual) ──────────────────────────────────────
  /** Nomor tujuan top-up (pulsa/e-wallet) yang diisi responden saat submit. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'destination_number' })
  destinationNumber: string | null;

  /** Jenis reward yang dipilih responden (pulsa, gopay, ovo, dana, shopeepay). */
  @Column({ type: 'varchar', length: 30, nullable: true, name: 'reward_type' })
  rewardType: string | null;

  @Column({ type: 'boolean', default: false, name: 'reward_distributed' })
  rewardDistributed: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'reward_distributed_at' })
  rewardDistributedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'reward_distributed_by' })
  rewardDistributedBy: string | null;

  @OneToMany(() => Answer, (answer) => answer.response, {
    cascade: true,
    eager: false,
  })
  answers: Answer[];
}
