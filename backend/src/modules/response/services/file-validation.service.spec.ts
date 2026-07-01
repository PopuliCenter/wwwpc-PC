import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FileValidationService, UploadedFileLike } from './file-validation.service';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF_MAGIC = Buffer.from('%PDF-1.7\n');
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function file(partial: Partial<UploadedFileLike>): UploadedFileLike {
  return {
    originalname: 'f',
    mimetype: 'image/png',
    size: partial.buffer?.length ?? 10,
    buffer: PNG_MAGIC,
    ...partial,
  };
}

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(() => {
    service = new FileValidationService();
  });

  it('accepts a valid PNG and returns ext/contentType', () => {
    const result = service.validate(file({ mimetype: 'image/png', buffer: PNG_MAGIC }));
    expect(result).toEqual({ ext: 'png', contentType: 'image/png' });
  });

  it('accepts a valid PDF', () => {
    const result = service.validate(
      file({ mimetype: 'application/pdf', buffer: PDF_MAGIC, size: PDF_MAGIC.length }),
    );
    expect(result.ext).toBe('pdf');
  });

  it('rejects when no file is provided', () => {
    expect(() => service.validate(undefined)).toThrow(BadRequestException);
  });

  it('rejects an empty file', () => {
    expect(() => service.validate(file({ size: 0, buffer: Buffer.alloc(0) }))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a disallowed MIME type', () => {
    expect(() =>
      service.validate(file({ mimetype: 'application/x-msdownload', buffer: PNG_MAGIC })),
    ).toThrow(BadRequestException);
  });

  it('rejects spoofed content: PNG mimetype but JPEG bytes', () => {
    expect(() => service.validate(file({ mimetype: 'image/png', buffer: JPEG_MAGIC }))).toThrow(
      BadRequestException,
    );
  });

  it('rejects an allowed mimetype whose bytes match nothing known', () => {
    expect(() =>
      service.validate(file({ mimetype: 'image/png', buffer: Buffer.from('not a real image') })),
    ).toThrow(BadRequestException);
  });

  it('rejects files over the size limit', () => {
    const big = service.maxUploadBytes + 1;
    expect(() =>
      service.validate(file({ mimetype: 'image/png', buffer: PNG_MAGIC, size: big })),
    ).toThrow(BadRequestException);
  });
});
