import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '@modules/auth/entities/user.entity';

/**
 * Satu item notifikasi DALAM aplikasi untuk seorang user (feed lonceng).
 * Diisi otomatis (mis. "survei baru") atau dari Pengumuman admin (broadcast).
 */
@Entity('user_notification')
@Index(['userId', 'readAt'])
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 'survey_new' | 'announcement' */
  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Rute internal saat diklik, mis. '/surveys/<id>/fill'. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  link: string | null;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
