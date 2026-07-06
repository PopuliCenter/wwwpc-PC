import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { WilayahPicker } from '@/components/common/WilayahPicker';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { OCCUPATIONS, OCCUPATION_OTHER } from '@/constants/occupations';

const selectCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Halaman "Lengkapi Data Diri" — wajib diisi responden yang profilnya belum
 * lengkap (mis. akun dibuat admin) sebelum bisa mengambil survei. Memakai ulang
 * endpoint POST /registration/complete-profile (data demografi pembobot).
 */
export function ProfileCompletionPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  // Pekerjaan: dropdown baku + isian bebas saat "Lainnya".
  const [occupationSelect, setOccupationSelect] = useState('');
  const [occupationOther, setOccupationOther] = useState('');
  const occupation =
    occupationSelect === OCCUPATION_OTHER ? occupationOther.trim() : occupationSelect;
  const [education, setEducation] = useState('');
  const [religion, setReligion] = useState('');
  const [wilayah, setWilayah] = useState({ province: '', city: '', district: '' });
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Akun tanpa nomor telepon (mis. via Google) wajib mengisinya di sini.
  const needPhone = !user?.phone;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!wilayah.province || !wilayah.city || !wilayah.district) {
      setError('Lengkapi provinsi, kabupaten/kota, dan kecamatan.');
      return;
    }
    if (needPhone && !/^[0-9+\-\s]{8,20}$/.test(phone.trim())) {
      setError('Masukkan nomor telepon yang valid.');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/registration/complete-profile', {
        dateOfBirth,
        age: ageFromDob(dateOfBirth) ?? undefined,
        gender,
        occupation,
        education,
        religion,
        province: wilayah.province,
        city: wilayah.city,
        district: wilayah.district,
        address,
      });
      // Simpan nomor telepon (bila belum ada) lewat endpoint profil.
      let savedPhone = user?.phone ?? null;
      if (needPhone) {
        const updated = await api.patch<{ phone: string }>('/auth/profile', {
          phone: phone.trim(),
        });
        savedPhone = updated.phone;
      }
      // Tandai profil lengkap di state agar gerbang terbuka, lalu ke daftar survei.
      if (user) setUser({ ...user, profileCompleted: true, phone: savedPhone ?? undefined });
      navigate('/surveys', { replace: true });
    } catch (err: unknown) {
      const e2 = err as { message?: string };
      setError(e2.message || 'Gagal menyimpan data diri. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lengkapi Data Diri</h1>
        <p className="mt-1 text-sm text-gray-600">
          Sebelum mengambil survei, mohon lengkapi data diri Anda. Data ini dipakai untuk pembobotan
          hasil dan tidak dapat diubah setelah disimpan.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Tanggal Lahir"
              type="date"
              max={TODAY_ISO}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
            />
            {ageFromDob(dateOfBirth) !== null && (
              <p className="mt-1 text-xs text-gray-500">Usia: {ageFromDob(dateOfBirth)} tahun</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Kelamin</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              required
              className={selectCls}
            >
              <option value="" disabled>
                Pilih…
              </option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Pekerjaan</label>
            <select
              value={occupationSelect}
              onChange={(e) => setOccupationSelect(e.target.value)}
              required
              className={selectCls}
            >
              <option value="" disabled>
                Pilih…
              </option>
              {OCCUPATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value={OCCUPATION_OTHER}>Lainnya…</option>
            </select>
            {occupationSelect === OCCUPATION_OTHER && (
              <div className="mt-2">
                <Input
                  value={occupationOther}
                  onChange={(e) => setOccupationOther(e.target.value)}
                  placeholder="Tulis pekerjaan Anda"
                  maxLength={100}
                  required
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Pendidikan Terakhir
            </label>
            <select
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              required
              className={selectCls}
            >
              <option value="" disabled>
                Pilih…
              </option>
              {['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Agama</label>
            <select
              value={religion}
              onChange={(e) => setReligion(e.target.value)}
              required
              className={selectCls}
            >
              <option value="" disabled>
                Pilih…
              </option>
              {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'].map(
                (v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-semibold text-gray-700">Alamat sesuai KTP</p>
          <WilayahPicker value={wilayah} onChange={setWilayah} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Alamat Lengkap</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            rows={2}
            placeholder="Jalan, RT/RW, kelurahan…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        {needPhone && (
          <div>
            <Input
              label="Nomor Telepon"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Dipakai untuk pengiriman reward. Wajib diisi untuk mengikuti survei.
            </p>
          </div>
        )}

        <Button type="submit" isLoading={isLoading} className="w-full">
          Simpan & Lanjutkan
        </Button>
      </form>
    </div>
  );
}
