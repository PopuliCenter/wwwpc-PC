import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '@shared/enums';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // Nullable: akun via Google tidak punya nomor HP. Unique tetap (Postgres
  // mengizinkan banyak NULL pada unique index).
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone: string | null;

  /**
   * Hash bcrypt. `select: false` (audit T-12): TIDAK ikut dimuat oleh find/
   * relasi/query builder biasa sehingga tak pernah bocor di respons API. Jalur
   * yang butuh (login, ganti sandi) memuatnya eksplisit lewat
   * `USER_SELECT_WITH_PASSWORD`.
   */
  @Column({ type: 'varchar', length: 255, name: 'password_hash', select: false })
  passwordHash: string;

  /** Apakah user sudah punya password pilihannya sendiri. false = akun Google
   * dgn password acak → tampilkan "Buat Password" (bukan "Ganti Password"). */
  @Column({ type: 'boolean', default: true, name: 'password_set' })
  passwordSet: boolean;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  /** URL avatar (foto Google atau avatar pilihan). Null = pakai inisial. */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'avatar_url' })
  avatarUrl: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.RESPONDENT })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ type: 'boolean', default: false, name: 'email_verified' })
  emailVerified: boolean;

  @Column({ type: 'boolean', default: false, name: 'profile_completed' })
  profileCompleted: boolean;

  /**
   * Versi sesi (audit T-11). Setiap JWT membawa klaim `tv`; token ditolak bila
   * tidak sama. Dinaikkan untuk mencabut SEMUA sesi user (nonaktif, reset/ganti
   * sandi, ganti peran, hapus akun). Lihat SessionRevocationService.
   */
  @Column({ type: 'int', default: 0, name: 'token_version' })
  tokenVersion: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Seluruh kolom User TERMASUK `passwordHash` (yang `select: false`). Dipakai
 * hanya di jalur yang memverifikasi sandi: `findOne({ where, select })`.
 */
export const USER_SELECT_WITH_PASSWORD: { [K in keyof User]: true } = {
  id: true,
  email: true,
  phone: true,
  passwordHash: true,
  passwordSet: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerified: true,
  profileCompleted: true,
  tokenVersion: true,
  createdAt: true,
  updatedAt: true,
};
