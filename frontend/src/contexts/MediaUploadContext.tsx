import { createContext, useContext } from 'react';
import { api } from '@/services/api';

/**
 * Fungsi unggah media yang mengembalikan NILAI JAWABAN:
 *  - online: object key dari server (mis. "survey-uploads/...")
 *  - offline (provider surveyor): referensi lokal "local-media://<id>" yang
 *    di-resolve saat sinkronisasi.
 */
export type UploadMediaFn = (file: Blob, surveyId: string, filename?: string) => Promise<string>;

/** Default: unggah langsung ke endpoint responden (perilaku lama). */
const defaultUpload: UploadMediaFn = async (file, surveyId, filename = 'upload') => {
  const formData = new FormData();
  formData.append('file', file, filename);
  const result = await api.upload<{ key: string }>(
    `/surveys/${surveyId}/responses/upload`,
    formData,
  );
  return result.key;
};

const MediaUploadContext = createContext<UploadMediaFn>(defaultUpload);

export const MediaUploadProvider = MediaUploadContext.Provider;

export function useMediaUpload(): UploadMediaFn {
  return useContext(MediaUploadContext);
}
