import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Survey, RewardMode } from './survey.entity';

@Entity('survey_reward_config')
export class SurveyRewardConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'survey_id' })
  surveyId: string;

  @OneToOne(() => Survey, (survey) => survey.rewardConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  @Column({
    type: 'enum',
    enum: ['automatic', 'manual'],
    enumName: 'reward_mode_enum',
    name: 'reward_mode',
  })
  rewardMode: RewardMode;

  @Column({ type: 'int', nullable: true, name: 'points_value' })
  pointsValue: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'manual_reward_type' })
  manualRewardType: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'manual_reward_nominal',
  })
  manualRewardNominal: number | null;
}
