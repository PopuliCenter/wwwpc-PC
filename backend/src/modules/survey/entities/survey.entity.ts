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

  @Column({ type: 'timestamp', nullable: true, name: 'start_datetime' })
  startDatetime: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'end_datetime' })
  endDatetime: Date | null;

  @Column({ type: 'int', nullable: true, name: 'max_duration_minutes' })
  maxDurationMinutes: number | null;

  @Column({ type: 'int', nullable: true, name: 'max_respondents' })
  maxRespondents: number | null;

  @Column({ type: 'boolean', default: false, name: 'randomize_options' })
  randomizeOptions: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'archived_at' })
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
