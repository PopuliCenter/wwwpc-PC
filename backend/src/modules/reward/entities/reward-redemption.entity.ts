import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@modules/auth/entities';

export enum RedemptionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('reward_redemption')
export class RewardRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255, name: 'reward_type' })
  rewardType: string;

  @Column({ type: 'int', name: 'points_spent' })
  pointsSpent: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'destination_number' })
  destinationNumber: string | null;

  @Column({
    type: 'enum',
    enum: RedemptionStatus,
    enumName: 'redemption_status_enum',
    default: RedemptionStatus.PENDING,
  })
  status: RedemptionStatus;

  @Column({ type: 'timestamp', name: 'requested_at', default: () => 'NOW()' })
  requestedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'processed_at' })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'otp_code' })
  otpCode: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'otp_expires_at' })
  otpExpiresAt: Date | null;

  /** Jumlah percobaan OTP yang salah (anti brute-force per-redemption). */
  @Column({ type: 'int', default: 0, name: 'otp_attempts' })
  otpAttempts: number;

  // ── Integrasi provider fulfillment (mis. IAK) ─────────────────────────────
  /** Nama provider yang memproses ('manual' | 'iak'). */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'provider' })
  provider: string | null;

  /** Ref id ringkas yang dikirim ke provider (dipakai mencocokkan callback).
   *  Dipisah dari `id` (UUID) karena gateway PPOB sering membatasi panjang ref_id. */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'provider_ref_id' })
  providerRefId: string | null;

  /** ID transaksi di sisi provider (mis. tr_id IAK). */
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'provider_trx_id' })
  providerTrxId: string | null;

  /** Serial number / token hasil (mis. SN pulsa, kode voucher). */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'provider_sn' })
  providerSn: string | null;

  /** Pesan/keterangan terakhir dari provider. */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'provider_message' })
  providerMessage: string | null;

  /** Penanda poin sudah dikembalikan (anti refund ganda saat gagal). */
  @Column({ type: 'boolean', default: false, name: 'refunded' })
  refunded: boolean;
}
