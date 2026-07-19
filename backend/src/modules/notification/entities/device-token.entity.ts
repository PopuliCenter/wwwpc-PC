import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '@modules/auth/entities/user.entity';

/**
 * Token perangkat (FCM/APNs) milik seorang user — dipakai untuk mengirim push
 * notifikasi (mis. "survei baru"). Satu user bisa punya banyak perangkat; token
 * bersifat UNIK (bila pindah akun, baris token yang sama dipindah ke user baru).
 */
@Entity('device_token')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index({ unique: true })
  @Column({ type: 'text' })
  token: string;

  /** 'android' | 'ios' | 'web' */
  @Column({ type: 'varchar', length: 16, default: 'android' })
  platform: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'last_seen_at', default: () => 'NOW()' })
  lastSeenAt: Date;
}
