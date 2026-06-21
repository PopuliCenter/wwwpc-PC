import { useState, type FormEvent } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { api } from '@/services/api';

/**
 * Pengumuman/Berita ke responden. Disiarkan ke lonceng (in-app) semua responden
 * aktif, dan opsional sekalian push ke perangkat (bila FCM aktif).
 */
export function AnnouncementPage() {
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
    if (!confirm('Kirim pengumuman ini ke semua responden aktif?')) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ recipients: number; pushed: number; emailed: number }>('/announcements', {
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        sendPush,
        sendEmail,
      });
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Megaphone className="h-6 w-6 text-primary-600" /> Pengumuman
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Kirim berita/info ke semua responden. Muncul di lonceng aplikasi mereka,
          dan opsional sebagai push notifikasi.
        </p>
      </div>

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {result}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Judul</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Contoh: Hadiah poin naik bulan ini!"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Isi</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Tulis pengumuman Anda di sini…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{body.length}/2000</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Link tujuan <span className="text-gray-400">(opsional)</span>
          </label>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Contoh: /rewards atau /surveys/<id>/fill"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <p className="mt-1 text-xs text-gray-400">
            Rute internal aplikasi yang dibuka saat notifikasi diketuk.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={sendPush}
            onChange={(e) => setSendPush(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Kirim juga sebagai push notifikasi (bila perangkat terdaftar)
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Kirim juga sebagai email ke semua responden
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Mengirim…' : 'Kirim Pengumuman'}
        </button>
      </form>
    </div>
  );
}
