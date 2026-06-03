import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { QuestionType } from '@shared/enums';
import { Survey } from './survey.entity';
import { SurveyPage } from './survey-page.entity';
import { QuestionOption } from './question-option.entity';

@Entity('question')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'survey_id' })
  surveyId: string;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  @Column({ type: 'uuid', name: 'page_id' })
  pageId: string;

  @ManyToOne(() => SurveyPage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page: SurveyPage;

  @Column({
    type: 'enum',
    enum: QuestionType,
    enumName: 'question_type_enum',
  })
  type: QuestionType;

  @Column({ type: 'text', name: 'question_text' })
  questionText: string;

  @Column({ type: 'boolean', default: false })
  required: boolean;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'jsonb', nullable: true, name: 'validation_rules' })
  validationRules: Record<string, any> | null;

  @Column({ type: 'boolean', default: false, name: 'has_other_option' })
  hasOtherOption: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => QuestionOption, (option) => option.question, {
    cascade: true,
    eager: true,
  })
  options: QuestionOption[];
}
