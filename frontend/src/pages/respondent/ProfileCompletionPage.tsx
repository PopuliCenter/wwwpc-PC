import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Notice } from '@/components/common/Notice';
import { WilayahPicker } from '@/components/common/WilayahPicker';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { OCCUPATIONS, OCCUPATION_OTHER } from '@/constants/occupations';

const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700';

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
    // Tanpa padding sendiri: <main> di RespondentLayout sudah memberi px dan py.
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl">Lengkapi data diri</h1>
        <p className="mt-1 text-sm text-gray-600">
          Sebelum mengambil survei, mohon lengkapi data diri Anda. Data ini dipakai untuk pembobotan
          hasil dan tidak dapat diubah setelah disimpan.
        </p>
      </div>

      {error && (
        <Notice tone="danger" role="alert" className="mb-4">
          {error}
        </Notice>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-panel p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Tanggal lahir"
              type="date"
              max={TODAY_ISO}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
            />
            {ageFromDob(dateOfBirth) !== null && (
              <p className="mt-1 text-xs text-gray-600">Usia: {ageFromDob(dateOfBirth)} tahun</p>
            )}
          </div>
          <div>
            <label htmlFor="jenis-kelamin" className={labelCls}>
              Jenis kelamin
            </label>
            <select
              id="jenis-kelamin"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              required
              className={fieldCls}
            >
              <option value="" disabled>
                Pilih…
              </option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </select>
          </div>
          <div>
            <label htmlFor="pekerjaan" className={labelCls}>
              Pekerjaan
            </label>
            <select
              id="pekerjaan"
              value={occupationSelect}
              onChange={(e) => setOccupationSelect(e.target.value)}
              required
              className={fieldCls}
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
                  aria-label="Pekerjaan lainnya"
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
            <label htmlFor="pendidikan-terakhir" className={labelCls}>
              Pendidikan terakhir
            </label>
            <select
              id="pendidikan-terakhir"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              required
              className={fieldCls}
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
            <label htmlFor="agama" className={labelCls}>
              Agama
            </label>
            <select
              id="agama"
              value={religion}
              onChange={(e) => setReligion(e.target.value)}
              required
              className={fieldCls}
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
          <p className="mb-2 text-sm font-semibold text-gray-900">Alamat sesuai KTP</p>
          <WilayahPicker value={wilayah} onChange={setWilayah} required />
        </div>

        <div>
          <label htmlFor="alamat-lengkap" className={labelCls}>
            Alamat lengkap
          </label>
          <textarea
            id="alamat-lengkap"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            rows={2}
            placeholder="Jalan, RT/RW, kelurahan…"
            className={textareaCls}
          />
        </div>

        {needPhone && (
          <Input
            label="Nomor telepon"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            helperText="Dipakai untuk pengiriman reward. Wajib diisi untuk mengikuti survei."
            required
          />
        )}

        <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
          Simpan dan lanjutkan
        </Button>
      </form>
    </div>
  );
}
