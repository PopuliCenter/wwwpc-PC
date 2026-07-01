import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Survey } from './survey.entity';

@Entity('survey_time_config')
export class SurveyTimeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'survey_id' })
  surveyId: string;

  @OneToOne(() => Survey, (survey) => survey.timeConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  @Column({ type: 'timestamp', nullable: true, name: 'start_datetime' })
  startDatetime: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'end_datetime' })
  endDatetime: Date | null;

  @Column({ type: 'int', nullable: true, name: 'max_duration_minutes' })
  maxDurationMinutes: number | null;

  @Column({ type: 'int', nullable: true, name: 'max_respondents' })
  maxRespondents: number | null;

  @Column({ type: 'int', default: 0, name: 'current_respondent_count' })
  currentRespondentCount: number;
}
