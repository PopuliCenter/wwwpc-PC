import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/auth/entities';
import { ExportFormat, ExportStatus } from '../interfaces';

@Entity('export_job')
export class ExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'requested_by' })
  requestedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser: User;

  @Column({
    type: 'enum',
    enum: ExportFormat,
    enumName: 'export_format_enum',
  })
  format: ExportFormat;

  @Column({
    type: 'enum',
    enum: ExportStatus,
    enumName: 'export_status_enum',
    default: ExportStatus.PENDING,
  })
  status: ExportStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'file_path' })
  filePath: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'filters_applied' })
  filtersApplied: Record<string, any> | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt: Date | null;
}
