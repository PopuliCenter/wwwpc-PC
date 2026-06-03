import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('visibility_rule')
export class VisibilityRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Question;

  @Column({ type: 'uuid', name: 'source_question_id' })
  sourceQuestionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_question_id' })
  sourceQuestion: Question;

  @Column({ type: 'varchar', length: 50, name: 'condition_operator' })
  conditionOperator: string;

  @Column({ type: 'varchar', length: 500, name: 'condition_value' })
  conditionValue: string;

  @Column({
    type: 'enum',
    enum: ['show', 'hide'],
    enumName: 'visibility_action_enum',
    name: 'visibility_action',
  })
  visibilityAction: 'show' | 'hide';
}
