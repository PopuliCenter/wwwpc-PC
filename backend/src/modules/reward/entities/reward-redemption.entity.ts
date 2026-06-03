import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
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
}
