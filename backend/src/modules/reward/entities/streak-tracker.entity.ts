import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/auth/entities';

@Entity('streak_tracker')
export class StreakTracker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', name: 'current_streak_days', default: 0 })
  currentStreakDays: number;

  @Column({ type: 'date', nullable: true, name: 'last_completion_date' })
  lastCompletionDate: Date | null;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 1,
    name: 'current_multiplier',
    default: 1.0,
  })
  currentMultiplier: number;
}
