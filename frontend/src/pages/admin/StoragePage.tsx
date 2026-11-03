import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  File as FileIcon,
  Eye,
  Trash2,
  Download,
  X,
  Search,
  CheckSquare,
  Square,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/services/api';
import { Button, useTapFeedback } from '@/components/common/Button';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { IconButton, iconButtonCls } from '@/components/common/IconButton';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Notice } from '@/components/common/Notice';
import { ListRowsSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';

interface StorageObject {
  key: string;
  size: number;
  lastModified: string | null;
}

interface ListResponse {
  bucket: string;
  objects: StorageObject[];
  nextToken?: string;
}

type BucketKey = 'uploads' | 'exports';

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'uploads', label: 'Unggahan responden' },
  { key: 'exports', label: 'Berkas ekspor' },
];

type Kind = 'image' | 'video' | 'audio' | 'doc' | 'other';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'heic'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', '3gp', 'mkv'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'opus'];
const DOC_EXT = ['pdf', 'csv', 'xlsx', 'xls', 'json', 'txt', 'doc', 'docx'];

function extOf(key: string): string {
  return key.split('.').pop()?.toLowerCase() ?? '';
}
function kindOf(key: string): Kind {
  // Avatar disimpan tanpa ekstensi (key `avatars/<userId>`) tapi selalu gambar.
  if (key.startsWith('avatars/')) return 'image';
  const e = extOf(key);
  if (IMAGE_EXT.includes(e)) return 'image';
  if (VIDEO_EXT.includes(e)) return 'video';
  if (AUDIO_EXT.includes(e)) return 'audio';
  if (DOC_EXT.includes(e)) return 'doc';
  return 'other';
}
/** Tentukan jenis pratinjau dari MIME content-type (lebih andal dari ekstensi). */
function kindFromMime(mime: string, key: string): Kind | 'pdf' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  const k = kindOf(key);
  return k === 'doc' && extOf(key) === 'pdf' ? 'pdf' : k;
}
const KIND_ICON: Record<Kind, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  doc: FileText,
  other: FileIcon,
};
const KIND_FILTERS: { key: 'all' | Kind; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'image', label: 'Foto' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'doc', label: 'Dokumen' },
  { key: 'other', label: 'Lainnya' },
];
type SortKey = 'recent' | 'name' | 'size' | 'kind';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Terbaru' },
  { key: 'name', label: 'Nama' },
  { key: 'size', label: 'Ukuran (besar→kecil)' },
  { key: 'kind', label: 'Tipe' },
];
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function baseName(key: string): string {
  return key.split('/').pop() || key;
}
/**
 * Nama tampil: buang UUID unik yang disisipkan saat upload
 * (`<nama>-<uuid>.<ext>`), tampilkan nama asli yang ramah. Untuk avatar
 * (key `avatars/<userId>`) tampilkan label generik.
 */
const UUID_RE = /-?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function displayName(key: string): string {
  if (key.startsWith('avatars/')) return 'Foto profil (avatar)';
  const base = baseName(key);
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const stem = ext ? base.slice(0, base.length - ext.length) : base;
  const cleaned = stem.replace(UUID_RE, '').replace(/^[-_]+|[-_]+$/g, '');
  return (cleaned || stem) + ext;
}

export function StoragePage() {
  const [bucket, setBucket] = useState<BucketKey>('uploads');
  const [prefix, setPrefix] = useState('');
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; kind: string; name: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const { confirm, dialog } = useConfirm();
  const tap = useTapFeedback();

  const fetchPage = useCallback(
    async (token?: string, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ bucket });
        if (prefix) q.set('prefix', prefix);
        if (token) q.set('token', token);
        const res = await api.get<ListResponse>(`/admin/storage/objects?${q.toString()}`);
        setObjects((prev) => (append ? [...prev, ...(res.objects ?? [])] : (res.objects ?? [])));
        setNextToken(res.nextToken);
        if (!append) setSelected(new Set());
      } catch (e) {
        setError((e as { message?: string })?.message || 'Gagal memuat daftar berkas.');
        if (!append) setObjects([]);
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [bucket, prefix],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const objectEndpoint = (key: string) =>
    `/admin/storage/object?bucket=${bucket}&key=${encodeURIComponent(key)}`;

  const handleView = async (key: string) => {
    setBusyKey(key);
    try {
      const blob = await api.getBlob(objectEndpoint(key));
      const url = URL.createObjectURL(blob);
      // Tentukan jenis dari MIME content-type sebenarnya — andal walau key tanpa
      // ekstensi (mis. avatar). image/video/audio/pdf → pratinjau inline.
      const kind = kindFromMime(blob.type || '', key);
      if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf') {
        setPreview({ url, kind, name: displayName(key) });
      } else {
        // Tipe tak dikenal → unduh.
        const a = document.createElement('a');
        a.href = url;
        a.download = displayName(key);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal membuka berkas.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (key: string) => {
    const ok = await confirm({
      title: 'Hapus berkas',
      message: `Hapus berkas ini secara PERMANEN?\n\n${key}`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setBusyKey(key);
    try {
      await api.delete(`/admin/storage/object?bucket=${bucket}&key=${encodeURIComponent(key)}`);
      setObjects((prev) => prev.filter((o) => o.key !== key));
      setSelected((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal menghapus berkas.');
    } finally {
      setBusyKey(null);
    }
  };

  const toggleOne = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Daftar yang ditampilkan: filter per-tipe + urutkan (di sisi klien, atas
  // objek yang sudah dimuat).
  const visibleObjects = useMemo(() => {
    const filtered =
      kindFilter === 'all' ? objects : objects.filter((o) => kindOf(o.key) === kindFilter);
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return displayName(a.key).localeCompare(displayName(b.key), 'id');
        case 'size':
          return b.size - a.size;
        case 'kind':
          return (
            kindOf(a.key).localeCompare(kindOf(b.key)) ||
            displayName(a.key).localeCompare(displayName(b.key), 'id')
          );
        case 'recent':
        default:
          return (b.lastModified ?? '').localeCompare(a.lastModified ?? '');
      }
    });
    return sorted;
  }, [objects, kindFilter, sortKey]);

  const allSelected = visibleObjects.length > 0 && visibleObjects.every((o) => selected.has(o.key));
  const toggleAll = () =>
    setSelected((prev) => {
      if (visibleObjects.every((o) => prev.has(o.key))) {
        const next = new Set(prev);
        visibleObjects.forEach((o) => next.delete(o.key));
        return next;
      }
      const next = new Set(prev);
      visibleObjects.forEach((o) => next.add(o.key));
      return next;
    });

  const selectedKeys = useMemo(() => Array.from(selected), [selected]);

  const handleBulkDelete = async () => {
    if (selectedKeys.length === 0) return;
    const ok = await confirm({
      title: 'Hapus berkas terpilih',
      message: `Hapus ${selectedKeys.length} berkas terpilih secara PERMANEN?\n\nTindakan ini tidak bisa dibatalkan.`,
      confirmText: `Hapus ${selectedKeys.length} berkas`,
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    setError(null);
    try {
      const res = await api.delete<{ deleted: string[]; failed: string[] }>(
        '/admin/storage/objects',
        { body: { bucket, keys: selectedKeys } },
      );
      const deletedSet = new Set(res.deleted ?? []);
      setObjects((prev) => prev.filter((o) => !deletedSet.has(o.key)));
      setSelected(new Set(res.failed ?? []));
      if ((res.failed?.length ?? 0) > 0) {
        setError(`${res.failed.length} berkas gagal dihapus dan masih terpilih.`);
      }
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal menghapus berkas terpilih.');
    } finally {
      setBulkBusy(false);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <div className="space-y-6">
      {dialog}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Penyimpanan (MinIO)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Berkas mentah: unggahan responden dan berkas ekspor.
        </p>
      </div>

      <Notice tone="warning">
        Menghapus berkas bersifat <strong className="font-semibold">permanen</strong> dan bisa
        memutus rujukan pada respons survei. Gunakan untuk pembersihan/koreksi yang disengaja.
      </Notice>

      {/* Bucket + cari */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Jenis berkas"
          options={BUCKETS}
          value={bucket}
          onChange={setBucket}
        />
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Filter awalan key (mis. survey-uploads/<surveyId>/)"
            aria-label="Filter awalan key"
            className={`${fieldCls} pl-9`}
          />
        </div>
      </div>

      {/* Filter tipe + urutan */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <label htmlFor="storageKind" className="mb-1 block text-xs text-gray-600">
            Jenis berkas
          </label>
          <select
            id="storageKind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | Kind)}
            className={fieldCls}
          >
            {KIND_FILTERS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-52">
          <label htmlFor="storageSort" className="mb-1 block text-xs text-gray-600">
            Urutkan
          </label>
          <select
            id="storageSort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={fieldCls}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {/* Daftar */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <ListRowsSkeleton rows={5} />
        </div>
      ) : visibleObjects.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-gray-600">Tidak ada berkas pada filter ini.</p>
        </div>
      ) : (
        <>
          {/* Toolbar seleksi */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? (
                <CheckSquare
                  className="h-4 w-4 text-primary-600"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <Square className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              {allSelected ? 'Batal pilih semua' : 'Pilih semua di halaman'}
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-gray-600">
                {selected.size > 0 ? `${selected.size} dipilih` : `${visibleObjects.length} berkas`}
              </span>
              {selected.size > 0 && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  isLoading={bulkBusy}
                  onClick={handleBulkDelete}
                >
                  {!bulkBusy && (
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  )}
                  Hapus terpilih
                </Button>
              )}
            </div>
          </div>

          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {visibleObjects.map((o) => {
              const Icon = KIND_ICON[kindOf(o.key)];
              const busy = busyKey === o.key;
              const checked = selected.has(o.key);
              return (
                <li
                  key={o.key}
                  className={`flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 ${checked ? 'bg-primary-50' : ''}`}
                >
                  <IconButton
                    aria-label={checked ? 'Batal pilih' : 'Pilih'}
                    aria-pressed={checked}
                    onClick={() => toggleOne(o.key)}
                  >
                    {checked ? (
                      <CheckSquare
                        className="h-[18px] w-[18px] text-primary-600"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Square className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    )}
                  </IconButton>
                  <Icon
                    className="h-[18px] w-[18px] shrink-0 text-gray-600"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {displayName(o.key)}
                    </p>
                    <p className="truncate text-xs text-gray-500">{o.key}</p>
                    <p className="text-xs tabular-nums text-gray-500">
                      {fmtSize(o.size)}
                      {o.lastModified
                        ? ` · ${new Date(o.lastModified).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
                        : ''}
                    </p>
                  </div>
                  <IconButton
                    aria-label="Lihat / unduh"
                    isLoading={busy}
                    onClick={() => handleView(o.key)}
                  >
                    <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </IconButton>
                  <IconButton
                    aria-label="Hapus"
                    destructive
                    disabled={busy}
                    onClick={() => handleDelete(o.key)}
                  >
                    <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {nextToken && !loading && (
        <div className="text-center">
          <Button
            type="button"
            variant="secondary"
            disabled={loadingMore}
            onClick={() => fetchPage(nextToken, true)}
          >
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </Button>
        </div>
      )}

      {/* Pratinjau */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div
            className="max-h-[90vh] max-w-3xl overflow-auto rounded-xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-gray-700">{preview.name}</span>
              <div className="flex items-center gap-1">
                <a
                  href={preview.url}
                  download={preview.name}
                  aria-label="Unduh"
                  title="Unduh"
                  onClick={tap}
                  className={iconButtonCls()}
                >
                  <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                </a>
                <IconButton aria-label="Tutup" onClick={closePreview}>
                  <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>
            {preview.kind === 'image' && (
              <img src={preview.url} alt={preview.name} className="max-h-[78vh] rounded-lg" />
            )}
            {preview.kind === 'video' && (
              <video src={preview.url} controls className="max-h-[78vh] rounded-lg" />
            )}
            {preview.kind === 'audio' && <audio src={preview.url} controls className="w-80" />}
            {preview.kind === 'pdf' && (
              <iframe
                src={preview.url}
                title={preview.name}
                className="h-[78vh] w-[80vw] max-w-2xl rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
