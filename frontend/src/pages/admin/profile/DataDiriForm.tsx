import { format } from 'date-fns';
import { Button } from '@/components/common/Button';
import { fieldCls } from '@/components/common/fieldStyles';
import { Notice } from '@/components/common/Notice';
import { GENDER_LABELS, type Demographics } from './types';

const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

function fmtDate(value: string | null): string {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd MMM yyyy');
  } catch {
    return value;
  }
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || '-'}</p>
    </div>
  );
}

interface DataDiriFormProps {
  fullName: string;
  onFullNameChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  isRespondent: boolean;
  phoneLocked: boolean;
  phoneNeeded: boolean;
  demographics: Demographics | null;
  saving: boolean;
  message: { ok: boolean; text: string } | null;
  onSubmit: (e: React.FormEvent) => void;
}

/** Form "Data Diri" + data demografi (pembobot, read-only) di bawahnya. */
export function DataDiriForm({
  fullName,
  onFullNameChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  isRespondent,
  phoneLocked,
  phoneNeeded,
  demographics,
  saving,
  message,
  onSubmit,
}: DataDiriFormProps) {
  return (
    <>
      <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Data diri</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className={labelClass}>
              Nama lengkap
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              className={fieldCls}
              required
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Nomor telepon
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className={fieldCls}
              placeholder={phoneNeeded ? '08xxxxxxxxxx' : undefined}
              required
              disabled={phoneLocked}
            />
            {phoneNeeded && (
              <p className="mt-1 text-xs text-warning-fg">
                Wajib diisi untuk bisa mengikuti survei.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className={fieldCls}
              required
              disabled={isRespondent}
            />
          </div>
          {isRespondent && (
            <p className="text-xs text-gray-600">
              {phoneNeeded
                ? 'Email terkait login dikunci. Nomor telepon dipakai untuk pengiriman reward — setelah diisi, perubahannya butuh verifikasi admin.'
                : 'Nomor telepon & email terkait pengiriman reward dan login, jadi perubahannya butuh verifikasi — hubungi admin untuk koreksi.'}
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" isLoading={saving}>
            {saving ? 'Menyimpan...' : 'Simpan perubahan'}
          </Button>
          {message && (
            <span
              role={message.ok ? 'status' : 'alert'}
              className={`text-sm ${message.ok ? 'text-success-fg' : 'text-danger-fg'}`}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>

      {/* Data demografi (pembobot) — read-only untuk responden */}
      {demographics && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Data demografi (pembobot)</h2>
          <p className="mb-4 text-xs text-gray-600">
            Data ini dikunci untuk menjaga kualitas analisis dan mencegah penyalahgunaan targeting.
            Untuk koreksi, hubungi admin.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Tanggal lahir" value={fmtDate(demographics.dateOfBirth)} />
            <ReadonlyField
              label="Usia"
              value={demographics.age != null ? `${demographics.age} tahun` : '-'}
            />
            <ReadonlyField
              label="Jenis kelamin"
              value={
                demographics.gender
                  ? (GENDER_LABELS[demographics.gender] ?? demographics.gender)
                  : '-'
              }
            />
            <ReadonlyField label="Pendidikan" value={demographics.education ?? '-'} />
            <ReadonlyField label="Pekerjaan" value={demographics.occupation ?? '-'} />
            <ReadonlyField label="Agama" value={demographics.religion ?? '-'} />
            <ReadonlyField label="Provinsi" value={demographics.province ?? '-'} />
            <ReadonlyField label="Kabupaten/Kota" value={demographics.city ?? '-'} />
            <ReadonlyField label="Kecamatan" value={demographics.district ?? '-'} />
          </div>
          <Notice className="mt-4">
            Domisili terkini Anda akan ditanyakan langsung di survei bila diperlukan, sehingga
            wilayah di atas tetap menjadi acuan data registrasi.
          </Notice>
        </div>
      )}
    </>
  );
}
