import { useState } from 'react';
import { mediaUrl } from '@/services/api';

function initials(name?: string): string {
  if (!name) return 'PC';
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'PC'
  );
}

interface AvatarProps {
  name?: string;
  url?: string | null;
  /** Diameter dalam px. */
  size?: number;
  className?: string;
}

/**
 * Avatar pengguna: tampilkan FOTO bila `url` ada (foto Google / avatar pilihan),
 * jika tidak ada / gagal dimuat → inisial nama dalam lingkaran.
 */
export function Avatar({ name, url, size = 40, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (url && !failed) {
    return (
      <img
        src={mediaUrl(url)}
        alt={name || 'Avatar'}
        style={dim}
        // no-referrer penting agar foto Google (lh3.googleusercontent.com) tidak 403.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-gray-100 object-cover ${className}`}
      />
    );
  }

  return (
    <span
      style={{ ...dim, fontSize: Math.round(size * 0.4) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-600 font-semibold leading-none text-white ${className}`}
    >
      {initials(name)}
    </span>
  );
}
