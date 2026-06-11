import { api, getAccessToken } from '@/services/api';

const BASE_URL = '/api';

/**
 * Tunggu job export selesai (polling), lalu unduh file-nya.
 * Export diproses async (Bull queue) di backend, file disimpan di MinIO dan
 * di-stream balik lewat backend (MinIO tidak diekspos ke publik).
 */
export async function pollAndDownloadExport(jobId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const job = await api.get<{ status: string }>(`/export/${jobId}/status`);
    if (job.status === 'completed') {
      await downloadExportFile(jobId);
      return;
    }
    if (job.status === 'failed') {
      throw new Error('Export gagal diproses di server.');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Export memakan waktu terlalu lama. Coba lagi nanti.');
}

async function downloadExportFile(jobId: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}/export/${jobId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Gagal mengunduh file export.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `export-${jobId}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
