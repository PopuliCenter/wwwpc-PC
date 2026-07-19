import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('scheduled_purge_config')
export class ScheduledPurgeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', name: 'retention_days', default: 365 })
  retentionDays: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 100, name: 'cron_expression', default: '0 2 * * *' })
  cronExpression: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_run_at' })
  lastRunAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
