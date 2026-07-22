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

  /** false = pertanyaan nonaktif (tak ditampilkan ke responden). Default true. */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;

  /**
   * Nama blok acak. Pertanyaan dengan nama blok sama akan diacak DI ANTARA
   * posisi mereka sendiri. NULL = tidak pernah diacak (default, dan wajib
   * untuk bagian data diri/penyaring agar urutannya sama dengan kuesioner TPD).
   */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'randomize_group' })
  randomizeGroup: string | null;

  /** Tetap di posisi aslinya meski bloknya diacak (mis. pengantar blok). */
  @Column({ type: 'boolean', default: false, name: 'pin_position' })
  pinPosition: boolean;

  @Column({ type: 'jsonb', nullable: true, name: 'validation_rules' })
  validationRules: Record<string, any> | null;

  @Column({ type: 'boolean', default: false, name: 'has_other_option' })
  hasOtherOption: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => QuestionOption, (option) => option.question, {
    cascade: true,
    eager: true,
  })
  options: QuestionOption[];
}
