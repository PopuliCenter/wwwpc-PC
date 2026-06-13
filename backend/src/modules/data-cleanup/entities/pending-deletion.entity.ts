import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Permintaan penghapusan data yang menunggu konfirmasi (double-confirmation).
 * Disimpan di DB (bukan memori) agar tahan restart aplikasi.
 */
@Entity('pending_deletion')
export class PendingDeletion {
  /** = requestId yang diberikan ke admin. */
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'confirmation_token' })
  confirmationToken: string;

  /** Kriteria penghapusan (surveyId, dateRange, dll). */
  @Column({ type: 'jsonb' })
  filters: Record<string, any>;

  @Column({ type: 'int', name: 'affected_count' })
  affectedCount: number;

  @Column({ type: 'uuid', name: 'admin_user_id' })
  adminUserId: string;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;
}
