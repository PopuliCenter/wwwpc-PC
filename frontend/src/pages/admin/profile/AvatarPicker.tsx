import { useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button, useTapFeedback } from '@/components/common/Button';

const AVATAR_STYLES = ['avataaars', 'bottts', 'fun-emoji', 'thumbs', 'identicon', 'adventurer'];

interface AvatarPickerProps {
  /** Dipakai sebagai seed DiceBear (nama/email pengguna). */
  seed: string;
  currentAvatarUrl: string | null | undefined;
  saving: boolean;
  onClose: () => void;
  onApplyAvatar: (url: string | null) => void;
  onUploadFile: (file: File) => void;
}

/** Overlay pemilih avatar: avatar generated (DiceBear), upload sendiri, atau hapus (pakai inisial). */
export function AvatarPicker({
  seed,
  currentAvatarUrl,
  saving,
  onClose,
  onApplyAvatar,
  onUploadFile,
}: AvatarPickerProps) {
  const tap = useTapFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarSeed = encodeURIComponent(seed || 'populi');
  const generatedAvatars = AVATAR_STYLES.map(
    (style) => `https://api.dicebear.com/9.x/${style}/svg?seed=${avatarSeed}`,
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset agar memilih file sama tetap memicu onChange
    if (file) onUploadFile(file);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-panel p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Pilih avatar</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Tutup
        </Button>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        Pilih salah satu avatar, atau hapus untuk memakai inisial nama. Foto akun Google terpasang
        otomatis saat login.
      </p>
      <div className="flex flex-wrap gap-3">
        {generatedAvatars.map((url) => (
          <button
            key={url}
            type="button"
            disabled={saving}
            aria-pressed={currentAvatarUrl === url}
            onClick={(e) => {
              tap(e);
              onApplyAvatar(url);
            }}
            className={`rounded-full ring-2 transition disabled:opacity-50 ${
              currentAvatarUrl === url ? 'ring-primary-600' : 'ring-transparent hover:ring-gray-200'
            }`}
          >
            <img
              src={url}
              alt="Pilihan avatar"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full bg-gray-50"
            />
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Unggah foto
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={saving || !currentAvatarUrl}
          onClick={() => onApplyAvatar(null)}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Hapus (pakai inisial)
        </Button>
      </div>
      {saving && <p className="mt-2 text-xs text-gray-600">Menyimpan…</p>}
    </div>
  );
}
