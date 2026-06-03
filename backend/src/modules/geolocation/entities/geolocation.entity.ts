import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/auth/entities/user.entity';

@Entity('geolocation')
export class Geolocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'bytea', nullable: true, name: 'encrypted_latitude' })
  encryptedLatitude: Buffer | null;

  @Column({ type: 'bytea', nullable: true, name: 'encrypted_longitude' })
  encryptedLongitude: Buffer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  province: string | null;

  @Column({ type: 'timestamp', default: () => 'NOW()', name: 'captured_at' })
  capturedAt: Date;
}
