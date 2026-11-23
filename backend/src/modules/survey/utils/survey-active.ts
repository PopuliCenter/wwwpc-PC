import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SurveyStatus } from '@shared/enums';

/** Pesan saat survei tidak (lagi) menerima pengisian. */
export const SURVEY_NOT_ACTIVE_MESSAGE = 'Survei ini sedang tidak menerima pengisian.';

/**
 * Lempar 403 bila survei tidak berstatus ACTIVE (audit T-14). DRAFT, INACTIVE,
 * dan ARCHIVED tidak boleh diisi, disimpan progresnya, dikirim, atau memberi
 * poin — termasuk respons `in_progress` yang dimulai sebelum survei dinonaktifkan.
 */
export function assertSurveyStatusActive(status: SurveyStatus | string | null | undefined): void {
  if (status !== SurveyStatus.ACTIVE) {
    throw new ForbiddenException(SURVEY_NOT_ACTIVE_MESSAGE);
  }
}

/** Varian yang membaca status survei lewat query mentah (repository/manager apa pun). */
export async function assertSurveyActive(
  runner: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
  surveyId: string,
): Promise<void> {
  const rows = await runner.query('SELECT status FROM survey WHERE id = $1 LIMIT 1', [surveyId]);
  if (!rows?.[0]) {
    throw new NotFoundException(`Survey with id ${surveyId} not found`);
  }
  assertSurveyStatusActive(rows[0].status);
}
