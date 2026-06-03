import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SurveyResponse } from './survey-response.entity';

@Entity('answer')
export class Answer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'response_id' })
  responseId: string;

  @ManyToOne(() => SurveyResponse, (response) => response.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'response_id' })
  response: SurveyResponse;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'jsonb', nullable: true })
  value: any;

  @Column({ type: 'timestamp', name: 'answered_at', default: () => 'NOW()' })
  answeredAt: Date;
}
