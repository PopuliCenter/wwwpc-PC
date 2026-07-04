import { AuthenticatedRequest } from '@modules/auth/interfaces';
import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Public } from '@modules/auth/decorators';
import { User } from '@modules/auth/entities/user.entity';
import { S3StorageService } from './s3-storage.service';

/**
 * Avatar pengguna yang DIUNGGAH sendiri → disimpan di MinIO (bucket uploads,
 * key `avatars/<userId>`) lalu disajikan lewat endpoint stream publik (MinIO
 * internal, tak terjangkau browser). avatar_url disimpan relatif `/avatar/<id>`
 * + cache-bust agar perubahan langsung terlihat.
 */
/**
 * Allowlist tipe gambar RASTER + validator magic-byte (anti-spoof). SVG SENGAJA
 * ditolak: bisa memuat <script> → XSS tersimpan karena avatar disajikan dari
 * origin API. Kunci = MIME; nilai = pengecek signature byte.
 */
const ALLOWED_AVATAR_TYPES = new Map<string, (b: Buffer) => boolean>([
  ['image/jpeg', (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  [
    'image/png',
    (b) => b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  ],
  [
    'image/webp',
    (b) =>
      b.length > 11 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  ],
  ['image/gif', (b) => b.length > 3 && b.toString('ascii', 0, 3) === 'GIF'],
]);

@Controller('avatar')
export class AvatarController {
  private static readonly KEY = (userId: string) => `avatars/${userId}`;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly s3: S3StorageService,
  ) {}

  /** Unggah foto avatar sendiri (gambar, maks 5 MB). */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) throw new BadRequestException('Berkas avatar wajib diunggah.');
    // Allowlist MIME + verifikasi magic-byte (tolak SVG & berkas yg dipalsukan).
    const magicCheck = ALLOWED_AVATAR_TYPES.get(file.mimetype ?? '');
    if (!magicCheck || !magicCheck(file.buffer)) {
      throw new BadRequestException('Avatar harus berupa gambar JPG, PNG, WEBP, atau GIF.');
    }
    const userId = req.user.userId;
    await this.s3.uploadBuffer(
      file.buffer,
      AvatarController.KEY(userId),
      file.mimetype,
      this.s3.uploadsBucket,
    );
    // Cache-bust agar avatar baru langsung tampil (URL berubah).
    const avatarUrl = `/avatar/${userId}?t=${Date.now()}`;
    await this.userRepository.update(userId, { avatarUrl });
    return { avatarUrl };
  }

  /** Stream foto avatar (publik — avatar bukan data sensitif, dipakai di <img>). */
  @Public()
  @Get(':userId')
  @SkipThrottle()
  async stream(@Param('userId') userId: string, @Res() res: Response): Promise<void> {
    try {
      const { buffer, contentType } = await this.s3.getObjectBuffer(
        AvatarController.KEY(userId),
        this.s3.uploadsBucket,
      );
      // Hanya sajikan tipe raster yg di-allowlist (avatar lama bertipe SVG dari
      // sebelum patch → paksa unduh, jangan render). nosniff cegah MIME-sniffing.
      const safeType = ALLOWED_AVATAR_TYPES.has(contentType)
        ? contentType
        : 'application/octet-stream';
      res.set('Content-Type', safeType);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch {
      throw new NotFoundException('Avatar tidak ditemukan.');
    }
  }
}
