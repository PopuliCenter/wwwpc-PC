import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * Minimal shape of a Multer-uploaded file. Declared locally so the module does
 * not depend on @types/multer (multer v2 does not ship the Express.Multer.File
 * global namespace in this project).
 */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedFile {
  ext: string;
  contentType: string;
}

interface Signature {
  contentType: string;
  ext: string;
  /** Returns true if the buffer's leading bytes match this file type. */
  match: (buf: Buffer) => boolean;
}

// Magic-byte signatures. Validating the actual bytes — not just the
// client-supplied MIME type or extension — prevents a malicious upload from
// disguising an executable/script as an allowed type.
const SIGNATURES: Signature[] = [
  {
    contentType: 'image/png',
    ext: 'png',
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    contentType: 'image/jpeg',
    ext: 'jpg',
    match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: 'image/gif',
    ext: 'gif',
    // "GIF87a" / "GIF89a"
    match: (b) => b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8',
  },
  {
    contentType: 'image/webp',
    ext: 'webp',
    // RIFF....WEBP
    match: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    contentType: 'application/pdf',
    ext: 'pdf',
    // "%PDF"
    match: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === '%PDF',
  },
  // ── Audio (rekaman MediaRecorder) ─────────────────────────────────────────
  {
    contentType: 'audio/webm',
    ext: 'webm',
    // EBML header (1A 45 DF A3) — kontainer WebM/Matroska.
    match: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  {
    contentType: 'audio/ogg',
    ext: 'ogg',
    // "OggS"
    match: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'OggS',
  },
  {
    contentType: 'audio/wav',
    ext: 'wav',
    // RIFF....WAVE
    match: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WAVE',
  },
  {
    contentType: 'audio/mp4',
    ext: 'm4a',
    // box "ftyp" pada offset 4 (kontainer MP4/M4A — dipakai Safari).
    match: (b) => b.length >= 8 && b.toString('ascii', 4, 8) === 'ftyp',
  },
];

@Injectable()
export class FileValidationService {
  /** Maximum allowed upload size in bytes (default 5 MB). */
  private readonly maxBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

  /** MIME types accepted by the application. */
  private readonly allowedContentTypes = new Set(SIGNATURES.map((s) => s.contentType));

  get maxUploadBytes(): number {
    return this.maxBytes;
  }

  /**
   * Validate an uploaded file by size, declared MIME type, and — critically —
   * its real magic bytes. Returns the detected extension/content-type to use
   * for the stored object. Throws BadRequestException on any failure.
   */
  validate(file: UploadedFileLike | undefined): ValidatedFile {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Berkas tidak ditemukan atau kosong');
    }

    if (file.size > this.maxBytes) {
      const mb = (this.maxBytes / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(`Ukuran berkas melebihi batas maksimal ${mb} MB`);
    }

    // Normalisasi: buang parameter (mis. "audio/webm;codecs=opus" dari
    // MediaRecorder) dan samakan ke huruf kecil sebelum dibandingkan.
    const declaredType = file.mimetype.split(';')[0].trim().toLowerCase();

    // The declared MIME type must be on the allowlist...
    if (!this.allowedContentTypes.has(declaredType)) {
      throw new BadRequestException(
        'Tipe berkas tidak diizinkan. Hanya gambar (PNG, JPG, GIF, WEBP), PDF, dan audio (WEBM, OGG, WAV, M4A).',
      );
    }

    // ...AND the real bytes must match a known signature.
    const detected = SIGNATURES.find((s) => s.match(file.buffer));
    if (!detected) {
      throw new BadRequestException('Isi berkas tidak sesuai dengan tipe yang diizinkan');
    }

    // The declared type must agree with the detected type (anti-spoofing).
    if (detected.contentType !== declaredType) {
      throw new BadRequestException('Tipe berkas tidak sesuai dengan isinya');
    }

    return { ext: detected.ext, contentType: detected.contentType };
  }
}
