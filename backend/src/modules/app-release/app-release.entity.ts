import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Satu rilis aplikasi native yang dicatat admin (lihat migrasi 1715000052000).
 * App membandingkan versionCode-nya dengan rilis terbaru untuk menampilkan
 * "versi baru tersedia"; rilis `forceUpdate` menjadi versi minimum.
 */
@Entity('app_release')
@Unique('uq_app_release_platform_version', ['platform', 'versionCode'])
export class AppRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Saat ini hanya 'android'. */
  @Column({ type: 'varchar', length: 16, default: 'android' })
  platform: string;

  /** `versionCode` Android (angka internal, naik tiap rilis). */
  @Column({ type: 'integer', name: 'version_code' })
  versionCode: number;

  /** `versionName` yang dilihat pengguna, mis. 1.1.0. */
  @Column({ type: 'varchar', length: 40, name: 'version_name' })
  versionName: string;

  /** Halaman unduhan resmi (populicenter.org) atau listing Google Play. */
  @Column({ type: 'varchar', length: 500, name: 'download_url' })
  downloadUrl: string;

  @Column({ type: 'text', name: 'release_notes', nullable: true })
  releaseNotes: string | null;

  /** true → versi di bawah rilis ini wajib memperbarui (diblokir di app). */
  @Column({ type: 'boolean', name: 'force_update', default: false })
  forceUpdate: boolean;

  /** Kapan rilis ini terakhir diumumkan (lonceng + push). */
  @Column({ type: 'timestamptz', name: 'notified_at', nullable: true })
  notifiedAt: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
