import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/auth/entities';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Entity('user_profile')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  /** Tanggal lahir (sumber utama; usia di atas diturunkan dari nilai ini). */
  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  dateOfBirth: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ type: 'varchar', length: 255, nullable: true })
  occupation: string;

  /** Pendidikan terakhir (mis. SD, SMP, SMA/SMK, D3, S1, S2, S3). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  education: string | null;

  /** Agama (Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, Lainnya). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  religion: string | null;

  /** Kabupaten/Kota domisili. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  province: string;

  /** Kecamatan domisili (tingkat detail wilayah paling dalam yang diminta). */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'district' })
  district: string | null;

  /** Alamat lengkap responden. */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'address' })
  address: string | null;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
