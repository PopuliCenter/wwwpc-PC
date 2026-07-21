import { User, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { GENDER_LABELS, type Demographics } from './types';

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-500';
const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

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
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || '-'}</p>
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
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <User className="h-4 w-4 text-primary-600" /> Data Diri
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className={labelClass}>
              Nama Lengkap
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Nomor Telepon
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className={inputClass}
              placeholder={phoneNeeded ? '08xxxxxxxxxx' : undefined}
              required
              disabled={phoneLocked}
            />
            {phoneNeeded && (
              <p className="mt-1 text-xs text-amber-600">
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
              className={inputClass}
              required
              disabled={isRespondent}
            />
          </div>
          {isRespondent && (
            <p className="text-xs text-gray-400">
              {phoneNeeded
                ? 'Email terkait login dikunci. Nomor telepon dipakai untuk pengiriman reward — setelah diisi, perubahannya butuh verifikasi admin.'
                : 'Nomor telepon & email terkait pengiriman reward dan login, jadi perubahannya butuh verifikasi — hubungi admin untuk koreksi.'}
            </p>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          {message && (
            <span className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </form>

      {/* Data demografi (pembobot) — read-only untuk responden */}
      {demographics && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
            <BarChart3 className="h-4 w-4 text-primary-600" /> Data Demografi (Pembobot)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Data ini dikunci untuk menjaga kualitas analisis dan mencegah penyalahgunaan targeting.
            Untuk koreksi, hubungi admin.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Tanggal Lahir" value={fmtDate(demographics.dateOfBirth)} />
            <ReadonlyField
              label="Usia"
              value={demographics.age != null ? `${demographics.age} tahun` : '-'}
            />
            <ReadonlyField
              label="Jenis Kelamin"
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
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Domisili terkini Anda akan ditanyakan langsung di survei bila diperlukan, sehingga
            wilayah di atas tetap menjadi acuan data registrasi.
          </p>
        </div>
      )}
    </>
  );
}
