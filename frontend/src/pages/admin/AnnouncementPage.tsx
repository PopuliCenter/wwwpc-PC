import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/common/Button';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Notice } from '@/components/common/Notice';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';

/**
 * Pengumuman/Berita ke responden. Disiarkan ke lonceng (in-app) semua responden
 * aktif, dan opsional sekalian push ke perangkat (bila FCM aktif).
 */
export function AnnouncementPage() {
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError('Judul dan isi pengumuman wajib diisi.');
      return;
    }
    const ok = await confirm({
      title: 'Kirim pengumuman',
      message: 'Kirim pengumuman ini ke semua responden aktif?',
      confirmText: 'Kirim',
      danger: false,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ recipients: number; pushed: number; emailed: number }>(
        '/announcements',
        {
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
          sendPush,
          sendEmail,
        },
      );
      const extras = [
        res.pushed > 0 ? `push ${res.pushed}` : null,
        res.emailed > 0 ? `email ${res.emailed}` : null,
      ].filter(Boolean);
      setResult(
        `Pengumuman terkirim ke ${res.recipients} responden (lonceng)` +
          (extras.length ? ` — ${extras.join(', ')}.` : '.'),
      );
      setTitle('');
      setBody('');
      setLink('');
    } catch (err: unknown) {
      const e2 = err as { message?: string };
      setError(e2.message || 'Gagal mengirim pengumuman.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {dialog}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengumuman</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kirim berita/info ke semua responden. Muncul di lonceng aplikasi mereka, dan opsional
          sebagai push notifikasi.
        </p>
      </div>

      {result && (
        <Notice tone="success" role="status">
          {result}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-panel p-5"
      >
        <div>
          <label
            htmlFor="announcementTitle"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Judul
          </label>
          <input
            id="announcementTitle"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Contoh: Survei baru minggu ini"
            className={fieldCls}
          />
        </div>

        <div>
          <label
            htmlFor="announcementBody"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Isi
          </label>
          <textarea
            id="announcementBody"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Tulis pengumuman Anda di sini…"
            className={textareaCls}
          />
          <p className="mt-1 text-right text-xs tabular-nums text-gray-500">{body.length}/2000</p>
        </div>

        <div>
          <label
            htmlFor="announcementLink"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Link tujuan <span className="font-normal text-gray-500">(opsional)</span>
          </label>
          <input
            id="announcementLink"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Contoh: /rewards atau /surveys/<id>/fill"
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-gray-600">
            Rute internal aplikasi yang dibuka saat notifikasi diketuk.
          </p>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={sendPush}
            onChange={(e) => setSendPush(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary-600"
          />
          Kirim juga sebagai push notifikasi (bila perangkat terdaftar)
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary-600"
          />
          Kirim juga sebagai email ke semua responden
        </label>

        <Button type="submit" disabled={submitting}>
          <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {submitting ? 'Mengirim…' : 'Kirim Pengumuman'}
        </Button>
      </form>
    </div>
  );
}
