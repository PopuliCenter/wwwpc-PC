interface LogoProps {
  /** Ukuran tampil dalam px. */
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * Logo Populi Center versi 96/192 px; berkas sumber 5700 px terlalu berat untuk
 * didekode di HP. Letakkan hanya di atas putih atau primary-900 karena di atas
 * surface kontrasnya tidak cukup.
 */
export function Logo({ size = 40, alt = 'Populi Center', className = '' }: LogoProps) {
  return (
    <img
      src="/logo-populi-center-96.png"
      srcSet="/logo-populi-center-96.png 96w, /logo-populi-center-192.png 192w"
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={alt}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
