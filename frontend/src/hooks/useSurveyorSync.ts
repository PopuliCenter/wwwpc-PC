import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';
import {
  queueGetAll,
  queueDelete,
  queueAdd,
  mediaGet,
  mediaDelete,
  LOCAL_MEDIA_PREFIX,
  type QueuedResponse,
} from '@/utils/offlineQueue';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Unggah blob media yang masih lokal (local-media://<id>) lalu ganti nilai
 * jawaban dengan object key dari server. Dijalankan sebelum mengirim respons.
 */
async function resolveLocalMedia(item: QueuedResponse): Promise<void> {
  const answers = (item.payload as { answers?: Array<{ questionId: string; value: unknown }> })
    .answers;
  if (!Array.isArray(answers)) return;
  for (const a of answers) {
    if (typeof a.value === 'string' && a.value.startsWith(LOCAL_MEDIA_PREFIX)) {
      const mediaId = a.value.slice(LOCAL_MEDIA_PREFIX.length);
      const media = await mediaGet(mediaId);
      if (!media) continue;
      const fd = new FormData();
      fd.append('file', media.blob, media.filename);
      const r = await api.upload<{ key: string }>(
        `/surveyor/surveys/${item.surveyId}/responses/upload`,
        fd,
      );
      a.value = r.key;
      await mediaDelete(mediaId);
    }
  }
}

interface SyncState {
  queuedCount: number;
  syncing: boolean;
  lastResult: string | null;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Manajer sinkronisasi antrian respons surveyor offline. Saat online, mengirim
 * tiap respons antri ke server (idempoten via clientSubmissionId = localId).
 */
export function useSurveyorSync(): SyncState {
  const online = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await queueGetAll();
    setQueuedCount(all.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const items = await queueGetAll();
      let ok = 0;
      let failed = 0;
      for (const item of items) {
        try {
          // Unggah dulu media offline (foto/audio/ttd/berkas) → ganti ke key.
          await resolveLocalMedia(item);
          await api.post(
            `/surveyor/surveys/${item.surveyId}/responses`,
            item.payload,
          );
          await queueDelete(item.localId);
          ok += 1;
        } catch (err: unknown) {
          // Simpan pesan error & tetap di antrian untuk dicoba lagi nanti.
          const updated: QueuedResponse = {
            ...item,
            attempts: item.attempts + 1,
            lastError: (err as { message?: string }).message ?? 'Gagal sinkron',
          };
          await queueAdd(updated);
          failed += 1;
        }
      }
      if (ok > 0 || failed > 0) {
        setLastResult(
          `Tersinkron: ${ok}${failed ? `, gagal: ${failed}` : ''}`,
        );
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [syncing, refresh]);

  // Sinkron otomatis saat kembali online & saat pertama dimuat.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (online) void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { queuedCount, syncing, lastResult, syncNow, refresh };
}
