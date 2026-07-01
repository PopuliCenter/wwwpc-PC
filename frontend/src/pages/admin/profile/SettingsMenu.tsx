import {
  LogOut,
  User,
  Lock,
  Trash2,
  ChevronRight,
  ShieldCheck,
  FileText,
  HelpCircle,
  Star,
  Coins,
  ClipboardList,
  Pencil,
  type LucideIcon,
} from 'lucide-react';

const ACTIVITIES: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Coins, label: 'Riwayat Poin', to: '/reward' },
  { icon: ClipboardList, label: 'Survei Saya', to: '/surveys' },
  { icon: HelpCircle, label: 'Bantuan', to: '/help' },
];

/** Satu baris menu (ikon + label + chevron). */
function MenuRow({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
    >
      <Icon className={`h-5 w-5 shrink-0 ${danger ? 'text-red-500' : 'text-primary-600'}`} />
      <span className={`flex-1 text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-800'}`}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
    </button>
  );
}

interface SettingsMenuProps {
  completeCount: number;
  completeChecks: { label: string; done: boolean }[];
  appVersion: string;
  onNavigate: (to: string) => void;
  onEditData: () => void;
  onSecurity: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onRating: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

/** Dashboard + menu Settings untuk responden (tombol edit, kelengkapan profil, aktivitas, menu akun). */
export function SettingsMenu({
  completeCount,
  completeChecks,
  appVersion,
  onNavigate,
  onEditData,
  onSecurity,
  onPrivacy,
  onTerms,
  onRating,
  onLogout,
  onDeleteAccount,
}: SettingsMenuProps) {
  return (
    <>
      {/* Tombol Ubah Data Diri menonjol */}
      <button
        type="button"
        onClick={onEditData}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
      >
        <Pencil className="h-4 w-4" /> Ubah Data Diri
      </button>

      {/* Kelengkapan profil */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Kelengkapan Profil</h3>
          <span className="text-xs font-semibold text-primary-600">{completeCount}/3</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all"
            style={{ width: `${(completeCount / 3) * 100}%` }}
          />
        </div>
        {completeCount < 3 ? (
          <ul className="mt-3 space-y-1.5">
            {completeChecks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    c.done ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {c.done ? '✓' : ''}
                </span>
                <span className={c.done ? 'text-gray-400 line-through' : 'text-gray-600'}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-emerald-600">Profil Anda sudah lengkap. 🎉</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Lengkapi untuk menambah kesempatan &amp; poin survei.
        </p>
      </div>

      {/* Aktivitas */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Aktivitas</h3>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITIES.map(({ icon: Icon, label, to }) => (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(to)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-gray-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-gray-600">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Akun
        </p>
        <div className="divide-y divide-gray-100">
          <MenuRow icon={User} label="Ubah Data Diri" onClick={onEditData} />
          <MenuRow icon={Lock} label="Keamanan Akun" onClick={onSecurity} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Info Lainnya
        </p>
        <div className="divide-y divide-gray-100">
          <MenuRow
            icon={HelpCircle}
            label="Pertanyaan Umum &amp; Bantuan"
            onClick={() => onNavigate('/help')}
          />
          <MenuRow icon={ShieldCheck} label="Kebijakan Privasi" onClick={onPrivacy} />
          <MenuRow icon={FileText} label="Syarat &amp; Ketentuan" onClick={onTerms} />
          <MenuRow icon={Star} label="Beri Review &amp; Rating" onClick={onRating} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          <MenuRow icon={LogOut} label="Keluar" danger onClick={onLogout} />
          <MenuRow icon={Trash2} label="Hapus Akun" danger onClick={onDeleteAccount} />
        </div>
      </div>

      <p className="pt-1 text-center text-xs text-gray-400">Versi {appVersion}</p>
    </>
  );
}
