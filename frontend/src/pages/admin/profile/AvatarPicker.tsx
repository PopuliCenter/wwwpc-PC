import { useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';

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
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Pilih Avatar</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Tutup
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Pilih salah satu avatar, atau hapus untuk memakai inisial nama. Foto akun Google terpasang
        otomatis saat login.
      </p>
      <div className="flex flex-wrap gap-3">
        {generatedAvatars.map((url) => (
          <button
            key={url}
            type="button"
            disabled={saving}
            onClick={() => onApplyAvatar(url)}
            className={`rounded-full ring-2 transition disabled:opacity-50 ${
              currentAvatarUrl === url ? 'ring-primary-500' : 'ring-transparent hover:ring-gray-200'
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
        <button
          type="button"
          disabled={saving}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" /> Upload foto
        </button>
        <button
          type="button"
          disabled={saving || !currentAvatarUrl}
          onClick={() => onApplyAvatar(null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Hapus (pakai inisial)
        </button>
      </div>
      {saving && <p className="mt-2 text-xs text-gray-400">Menyimpan…</p>}
    </div>
  );
}
