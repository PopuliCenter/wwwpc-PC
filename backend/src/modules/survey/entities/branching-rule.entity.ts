import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SurveyPage } from './survey-page.entity';
import { Question } from './question.entity';

@Entity('branching_rule')
export class BranchingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'page_id' })
  pageId: string;

  @ManyToOne(() => SurveyPage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page: SurveyPage;

  @Column({ type: 'uuid', name: 'source_question_id' })
  sourceQuestionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_question_id' })
  sourceQuestion: Question;

  @Column({ type: 'varchar', length: 50, name: 'condition_operator' })
  conditionOperator: string;

  @Column({ type: 'varchar', length: 500, name: 'condition_value' })
  conditionValue: string;

  @Column({ type: 'uuid', name: 'target_page_id' })
  targetPageId: string;

  @ManyToOne(() => SurveyPage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_page_id' })
  targetPage: SurveyPage;
}
