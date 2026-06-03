import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('skip_logic_rule')
export class SkipLogicRule {
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
    enum: ['skip', 'jump_to'],
    enumName: 'skip_logic_action_enum',
  })
  action: 'skip' | 'jump_to';

  @Column({ type: 'uuid', nullable: true, name: 'target_question_id' })
  targetQuestionId: string | null;

  @ManyToOne(() => Question, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_question_id' })
  targetQuestion: Question | null;
}
