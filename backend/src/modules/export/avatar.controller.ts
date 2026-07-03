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
import { User } from '@modules/auth/entities/user.entity';
import { S3StorageService } from './s3-storage.service';

/**
 * Avatar pengguna yang DIUNGGAH sendiri → disimpan di MinIO (bucket uploads,
 * key `avatars/<userId>`) lalu disajikan lewat endpoint stream publik (MinIO
 * internal, tak terjangkau browser). avatar_url disimpan relatif `/avatar/<id>`
 * + cache-bust agar perubahan langsung terlihat.
 */
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
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Avatar harus berupa gambar.');
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
  @Get(':userId')
  @SkipThrottle()
  async stream(@Param('userId') userId: string, @Res() res: Response): Promise<void> {
    try {
      const { buffer, contentType } = await this.s3.getObjectBuffer(
        AvatarController.KEY(userId),
        this.s3.uploadsBucket,
      );
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch {
      throw new NotFoundException('Avatar tidak ditemukan.');
    }
  }
}
