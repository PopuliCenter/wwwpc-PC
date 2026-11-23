import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SurveyResponse } from '../entities/survey-response.entity';

/**
 * Lookup idempotensi `clientSubmissionId` (offline -> sync) yang DIBATASI ke
 * pemiliknya (T-30). Dulu pencarian hanya memakai ID, sehingga akun lain yang
 * memakai ID yang sama menerima respons (beserta jawaban) milik orang lain.
 *
 * - tidak ada baris dgn ID ini       -> null (lanjut proses normal);
 * - milik respondentId + surveyId ini -> baris itu (retry sah, idempoten);
 * - milik akun/survei lain            -> 409 tanpa membocorkan apa pun.
 */
export async function findOwnSubmission(
  repo: Repository<SurveyResponse>,
  clientSubmissionId: string,
  respondentId: string,
  surveyId: string,
): Promise<SurveyResponse | null> {
  const row = await repo.findOne({ where: { clientSubmissionId } });
  if (!row) return null;
  if (row.respondentId === respondentId && row.surveyId === surveyId) return row;
  throw new ConflictException('ID pengiriman ini sudah dipakai. Muat ulang lalu kirim ulang.');
}
