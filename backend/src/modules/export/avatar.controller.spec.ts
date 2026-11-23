import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AvatarController } from './avatar.controller';
import { S3StorageService } from './s3-storage.service';
import { User } from '@modules/auth/entities/user.entity';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('AvatarController GET /avatar/:userId (audit T-16, T-40)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const userRepository = { findOne: vi.fn(), update: vi.fn() };
  const s3 = { uploadsBucket: 'uploads', getObjectBuffer: vi.fn(), uploadBuffer: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AvatarController],
      providers: [
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: S3StorageService, useValue: s3 },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    s3.getObjectBuffer.mockResolvedValue({ buffer: PNG, contentType: 'image/png' });
  });

  it('serves the uploaded avatar of an existing user', async () => {
    userRepository.findOne.mockResolvedValue({ id: ID, avatarUrl: `/avatar/${ID}?t=1` });
    const res = await fetch(`${baseUrl}/avatar/${ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(s3.getObjectBuffer).toHaveBeenCalledWith(`avatars/${ID}`, 'uploads');
  });

  it('404 for a deleted user even if the object still exists in MinIO', async () => {
    userRepository.findOne.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/avatar/${ID}`);
    expect(res.status).toBe(404);
    expect(s3.getObjectBuffer).not.toHaveBeenCalled();
  });

  it('404 when the user no longer uses an uploaded avatar', async () => {
    userRepository.findOne.mockResolvedValue({ id: ID, avatarUrl: 'https://lh3.example/foto' });
    expect((await fetch(`${baseUrl}/avatar/${ID}`)).status).toBe(404);
    userRepository.findOne.mockResolvedValue({ id: ID, avatarUrl: null });
    expect((await fetch(`${baseUrl}/avatar/${ID}`)).status).toBe(404);
    expect(s3.getObjectBuffer).not.toHaveBeenCalled();
  });

  it.each(['not-a-uuid', '..%2Fsurvey-uploads%2Fx', `${ID}x`])(
    'rejects non-UUID id %s with 404 without touching storage',
    async (id) => {
      const res = await fetch(`${baseUrl}/avatar/${id}`);
      expect(res.status).toBe(404);
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(s3.getObjectBuffer).not.toHaveBeenCalled();
    },
  );
});
