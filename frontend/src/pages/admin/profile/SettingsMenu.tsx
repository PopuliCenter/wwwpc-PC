import {
  Check,
  LogOut,
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
import { Button, useTapFeedback } from '@/components/common/Button';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { useTheme, type ThemePreference } from '@/utils/theme';

// "Bantuan" tidak diulang di sini: sudah ada di "Pertanyaan Umum & Bantuan" di bawah.
const ACTIVITIES: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Coins, label: 'Riwayat poin', to: '/rewards' },
  { icon: ClipboardList, label: 'Survei saya', to: '/surveys' },
];

const panelCls = 'overflow-hidden rounded-xl border border-gray-200 bg-panel';
const panelTitleCls = 'border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-600';

const THEME_OPTIONS: ReadonlyArray<{ key: ThemePreference; label: string }> = [
  { key: 'system', label: 'Ikuti sistem' },
  { key: 'light', label: 'Terang' },
  { key: 'dark', label: 'Gelap' },
];

/** Pilihan tema. Tidak tampil di mode embed karena di sana tema selalu terang. */
export function AppearancePanel() {
  const { preference, setPreference, locked } = useTheme();
  if (locked) return null;
  return (
    <div className={panelCls}>
      <p className={panelTitleCls}>Tampilan</p>
      <div className="p-4">
        <SegmentedControl
          label="Tema tampilan"
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
        />
      </div>
    </div>
  );
}

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
  const tap = useTapFeedback();
  return (
    <button
      type="button"
      onClick={(e) => {
        tap(e);
        onClick();
      }}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 focus-visible:-outline-offset-2"
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${danger ? 'text-danger-fg' : 'text-gray-600'}`}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className={`flex-1 text-sm font-medium ${danger ? 'text-danger-fg' : 'text-gray-800'}`}>
        {label}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-gray-400"
        strokeWidth={1.75}
        aria-hidden="true"
      />
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
      {/* Satu-satunya pintu Ubah Data Diri */}
      <Button type="button" variant="secondary" className="w-full" onClick={onEditData}>
        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Ubah data diri
      </Button>

      {/* Kelengkapan profil */}
      <div className="rounded-xl border border-gray-200 bg-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Kelengkapan profil</h2>
          <span className="text-xs font-medium tabular-nums text-gray-700">{completeCount}/3</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden bg-gray-100">
          <div
            className="h-2 bg-primary-600 transition-all"
            style={{ width: `${(completeCount / 3) * 100}%` }}
          />
        </div>
        {completeCount < 3 ? (
          <ul className="mt-3 space-y-1.5">
            {completeChecks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                {c.done ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-success-fg"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="mx-0.5 h-3 w-3 shrink-0 rounded-sm border border-gray-300"
                    aria-hidden="true"
                  />
                )}
                <span className={c.done ? 'text-gray-500 line-through' : 'text-gray-700'}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-success-fg">Profil Anda sudah lengkap.</p>
        )}
      </div>

      {/* Aktivitas */}
      <div className={panelCls}>
        <p className={panelTitleCls}>Aktivitas</p>
        <div className="divide-y divide-gray-100">
          {ACTIVITIES.map(({ icon, label, to }) => (
            <MenuRow key={label} icon={icon} label={label} onClick={() => onNavigate(to)} />
          ))}
        </div>
      </div>

      <AppearancePanel />

      <div className={panelCls}>
        <p className={panelTitleCls}>Akun</p>
        <div className="divide-y divide-gray-100">
          <MenuRow icon={Lock} label="Keamanan akun" onClick={onSecurity} />
        </div>
      </div>

      <div className={panelCls}>
        <p className={panelTitleCls}>Info lainnya</p>
        <div className="divide-y divide-gray-100">
          <MenuRow
            icon={HelpCircle}
            label="Pertanyaan umum &amp; bantuan"
            onClick={() => onNavigate('/help')}
          />
          <MenuRow icon={ShieldCheck} label="Kebijakan Privasi" onClick={onPrivacy} />
          <MenuRow icon={FileText} label="Syarat &amp; Ketentuan" onClick={onTerms} />
          <MenuRow icon={Star} label="Beri review &amp; rating" onClick={onRating} />
        </div>
      </div>

      <div className={panelCls}>
        <div className="divide-y divide-gray-100">
          <MenuRow icon={LogOut} label="Keluar" onClick={onLogout} />
          <MenuRow icon={Trash2} label="Hapus akun" danger onClick={onDeleteAccount} />
        </div>
      </div>

      <p className="pt-1 text-center text-xs tabular-nums text-gray-500">Versi {appVersion}</p>
    </>
  );
}
