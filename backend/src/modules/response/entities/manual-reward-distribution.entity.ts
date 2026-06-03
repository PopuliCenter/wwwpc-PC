import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities';

export enum ManualRewardStatus {
  PENDING = 'pending',
  DISTRIBUTED = 'distributed',
}

@Entity('manual_reward_distribution')
export class ManualRewardDistribution {
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

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'destination_number' })
  destinationNumber: string | null;

  @Column({
    type: 'enum',
    enum: ManualRewardStatus,
    enumName: 'manual_reward_status_enum',
    default: ManualRewardStatus.PENDING,
  })
  status: ManualRewardStatus;

  @Column({ type: 'timestamp', nullable: true, name: 'distributed_at' })
  distributedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'distributed_by' })
  distributedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'distributed_by' })
  distributor: User;
}
