import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Copy, KeyRound, Pencil, Plus, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { Pagination } from '@/components/common/Pagination';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { RowMenu } from '@/components/common/RowMenu';
import { TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
const thCls = `${thBaseCls} whitespace-nowrap py-2.5 text-left`;
const tdBase = `${tdBaseCls} text-sm`;
const tdCls = `${tdBase} py-3 text-gray-600`;
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

// Types
interface UserItem {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UsersResponse {
  data: UserItem[];
  total: number;
  page: number;
  limit: number;
}

interface CreateUserPayload {
  fullName: string;
  email: string;
  phone?: string;
  role: 'admin' | 'analyst' | 'viewer' | 'surveyor';
}

interface BulkImportResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ row: number; message: string }>;
}

// Modal Component
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative mx-4 max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="min-w-0 text-lg font-semibold text-gray-900">{title}</h3>
          <IconButton aria-label="Tutup" onClick={onClose}>
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Password yang hanya tampil sekali: terus terlihat sampai dialog ditutup, bisa disalin. */
function PasswordReveal({ label, password }: { label: string; password: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard bisa ditolak browser; password tetap terlihat untuk disalin manual.
    }
  };

  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <p className="min-w-0">
        {label}:{' '}
        <code className="break-all rounded-sm border border-gray-200 bg-white px-1.5 py-0.5 font-mono">
          {password}
        </code>
      </p>
      <IconButton
        aria-label={copied ? 'Kata sandi tersalin' : 'Salin kata sandi'}
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-[18px] w-[18px] text-success-fg" strokeWidth={1.75} />
        ) : (
          <Copy className="h-[18px] w-[18px]" strokeWidth={1.75} />
        )}
      </IconButton>
    </div>
  );
}

// Create User Modal
function CreateUserModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CreateUserPayload>({
    fullName: '',
    email: '',
    phone: '',
    role: 'viewer',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ temporaryPassword: string }>('/users', form);
      setTempPassword(result.temporaryPassword);
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal membuat pengguna');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm({ fullName: '', email: '', phone: '', role: 'viewer' });
    setError(null);
    setTempPassword(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Tambah Pengguna Baru">
      {tempPassword ? (
        <div className="space-y-4">
          <Notice tone="success" title="Pengguna berhasil dibuat">
            <PasswordReveal label="Kata sandi sementara" password={tempPassword} />
          </Notice>
          <Button type="button" variant="secondary" onClick={handleClose} className="w-full">
            Tutup
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <div>
            <label htmlFor="fullName" className={labelCls}>
              Nama Lengkap
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="email" className={labelCls}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelCls}>
              Nomor Telepon
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="role" className={labelCls}>
              Peran
            </label>
            <select
              id="role"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as CreateUserPayload['role'] })
              }
              className={fieldCls}
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analis</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// Bulk Import Modal
function BulkImportModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const res = await api.post<BulkImportResult>('/users/bulk-import', { csvContent: text });
      setResult(res);
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal mengimpor pengguna');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Impor pengguna (CSV)">
      {result ? (
        <div className="space-y-3">
          <Notice tone="success" title="Impor selesai">
            <p className="tabular-nums">Berhasil: {result.successCount}</p>
            <p className="tabular-nums">Gagal: {result.failedCount}</p>
          </Notice>
          {result.errors.length > 0 && (
            <Notice tone="danger" title="Detail Error:" className="max-h-40 overflow-y-auto">
              {result.errors.map((err, idx) => (
                <p key={idx} className="text-xs">
                  Baris {err.row}: {err.message}
                </p>
              ))}
            </Notice>
          )}
          <Button type="button" variant="secondary" onClick={handleClose} className="w-full">
            Tutup
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <div>
            <label htmlFor="bulkImportFile" className="mb-2 block text-sm text-gray-600">
              Unggah berkas CSV dengan kolom: nama, email, phone, role
            </label>
            <input
              id="bulkImportFile"
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-4 file:h-11 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-4 file:text-sm file:font-medium file:text-gray-800 hover:file:bg-gray-50 lg:file:h-10"
            />
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={handleClose} className="flex-1">
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!file || loading}
              className="flex-1"
            >
              {loading ? 'Mengimpor...' : 'Impor'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Edit User Modal — ubah data diri + (opsional) set password baru
function EditUserModal({
  open,
  onClose,
  user,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  user: UserItem | null;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setPhone(user.phone ?? '');
      setPassword('');
      setError(null);
      setDone(false);
    }
  }, [user]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, string> = { fullName, email, phone };
      if (password.trim()) payload.password = password.trim();
      await api.patch(`/users/${user.id}`, payload);
      setDone(true);
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { message?: string | string[] };
      const msg = Array.isArray(apiErr.message) ? apiErr.message.join(', ') : apiErr.message;
      setError(msg || 'Gagal menyimpan perubahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit Pengguna — ${user.fullName}`}>
      {done ? (
        <div className="space-y-4">
          <Notice tone="success">Perubahan tersimpan.</Notice>
          <Button type="button" onClick={onClose} className="w-full">
            Tutup
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <div>
            <label htmlFor="editFullName" className={labelCls}>
              Nama Lengkap
            </label>
            <input
              id="editFullName"
              className={fieldCls}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="editEmail" className={labelCls}>
              Email
            </label>
            <input
              id="editEmail"
              type="email"
              className={fieldCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="editPhone" className={labelCls}>
              Nomor Telepon
            </label>
            <input
              id="editPhone"
              className={fieldCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="editPassword" className={labelCls}>
              Kata Sandi Baru{' '}
              <span className="font-normal text-gray-500">(kosongkan jika tidak diubah)</span>
            </label>
            <input
              id="editPassword"
              type="text"
              className={fieldCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 karakter"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

export function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Action feedback
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    tone: 'success' | 'danger';
  } | null>(null);

  // Password hasil reset: tampil di dialog sampai admin menutupnya.
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);

  // Edit user modal
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const { confirm, dialog } = useConfirm();

  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const result = await api.get<UsersResponse>(`/users?${params.toString()}`);
      setUsers(result.data);
      setTotal(result.total);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data pengguna');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, statusFilter, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      setActionMessage({ text: 'Peran berhasil diubah', tone: 'success' });
      fetchUsers();
    } catch {
      setActionMessage({ text: 'Gagal mengubah role', tone: 'danger' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleToggleStatus = async (user: UserItem) => {
    const { isActive } = user;
    const ok = await confirm({
      title: isActive ? 'Nonaktifkan pengguna' : 'Aktifkan pengguna',
      message: isActive
        ? `Nonaktifkan akun "${user.fullName}" (${user.email})?`
        : `Aktifkan kembali akun "${user.fullName}" (${user.email})?`,
      confirmText: isActive ? 'Nonaktifkan' : 'Aktifkan',
      danger: isActive,
    });
    if (!ok) return;
    try {
      const endpoint = isActive ? 'deactivate' : 'activate';
      await api.patch(`/users/${user.id}/${endpoint}`);
      setActionMessage({
        text: isActive ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan',
        tone: 'success',
      });
      fetchUsers();
    } catch {
      setActionMessage({ text: 'Gagal mengubah status', tone: 'danger' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleResetPassword = async (user: UserItem) => {
    const ok = await confirm({
      title: 'Reset kata sandi',
      message: `Reset kata sandi akun "${user.fullName}" (${user.email})? Kata sandi lama tidak berlaku lagi.`,
      confirmText: 'Reset',
    });
    if (!ok) return;
    try {
      const result = await api.post<{ temporaryPassword: string }>(
        `/users/${user.id}/reset-password`,
      );
      setResetResult({ name: user.fullName, password: result.temporaryPassword });
    } catch {
      setActionMessage({ text: 'Gagal mereset kata sandi', tone: 'danger' });
      setTimeout(() => setActionMessage(null), 8000);
    }
  };

  const handleDelete = async (user: { id: string; fullName: string; email: string }) => {
    const ok = await confirm({
      title: 'Hapus akun',
      message: `Hapus permanen akun "${user.fullName}" (${user.email})? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await api.delete(`/users/${user.id}`);
      setActionMessage({ text: `Akun ${user.email} dihapus.`, tone: 'success' });
      fetchUsers();
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Gagal menghapus akun';
      setActionMessage({ text: msg, tone: 'danger' });
    }
    setTimeout(() => setActionMessage(null), 8000);
  };

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowImportModal(true)}>
            Impor CSV
          </Button>
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Pengguna
          </Button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <Notice
          tone={actionMessage.tone}
          role={actionMessage.tone === 'danger' ? 'alert' : 'status'}
        >
          {actionMessage.text}
        </Notice>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="search" className={labelCls}>
              Cari
            </label>
            <input
              id="search"
              type="text"
              placeholder="Nama atau email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="roleFilter" className={labelCls}>
              Peran
            </label>
            <select
              id="roleFilter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            >
              <option value="">Semua Peran</option>
              <option value="admin">Admin</option>
              <option value="analyst">Analis</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div>
            <label htmlFor="statusFilter" className={labelCls}>
              Status
            </label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            >
              <option value="">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={thCls}>Nama dan email</th>
                  <th className={thCls}>Telepon</th>
                  <th className={thCls}>Peran</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Dibuat</th>
                  <th className={`${thBaseCls} whitespace-nowrap py-2.5 text-right`}>Aksi</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`${tdBase} py-8 text-center text-gray-600`}>
                      Tidak ada pengguna ditemukan
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className={`${tdBase} py-3`}>
                        <p className="min-w-[180px] text-gray-900">{user.fullName}</p>
                        <p className="break-all text-xs text-gray-600">{user.email}</p>
                      </td>
                      <td className={`${tdCls} tabular-nums`}>{user.phone || '-'}</td>
                      <td className={`${tdBase} py-1.5`}>
                        <div className="w-32">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            className={fieldCls}
                            aria-label={`Peran untuk ${user.fullName}`}
                          >
                            <option value="admin">Admin</option>
                            <option value="analyst">Analis</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                      </td>
                      <td className={`${tdBase} whitespace-nowrap py-3`}>
                        {user.isActive ? (
                          <Badge tone="active">Aktif</Badge>
                        ) : (
                          <Badge tone="neutral" dot>
                            Nonaktif
                          </Badge>
                        )}
                      </td>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                        {format(new Date(user.createdAt), 'dd/MM/yyyy')}
                      </td>
                      <td className={`${tdBase} py-1.5`}>
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            aria-label={`Edit ${user.fullName}`}
                            onClick={() => setEditingUser(user)}
                          >
                            <Pencil className="h-[18px] w-[18px]" strokeWidth={1.75} />
                          </IconButton>
                          <RowMenu
                            label={`Aksi lainnya untuk ${user.fullName}`}
                            items={[
                              {
                                label: 'Reset Kata Sandi',
                                icon: KeyRound,
                                onClick: () => handleResetPassword(user),
                              },
                              user.isActive
                                ? {
                                    label: 'Nonaktifkan',
                                    icon: UserX,
                                    onClick: () => handleToggleStatus(user),
                                  }
                                : {
                                    label: 'Aktifkan',
                                    icon: UserCheck,
                                    onClick: () => handleToggleStatus(user),
                                  },
                              {
                                label: 'Hapus',
                                icon: Trash2,
                                destructive: true,
                                onClick: () => handleDelete(user),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
      </div>

      {/* Modals */}
      <CreateUserModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchUsers}
      />
      <BulkImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchUsers}
      />
      <EditUserModal
        open={!!editingUser}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={fetchUsers}
      />
      <Modal
        open={!!resetResult}
        onClose={() => setResetResult(null)}
        title={`Kata sandi direset — ${resetResult?.name ?? ''}`}
      >
        {resetResult && (
          <div className="space-y-4">
            <Notice tone="success">
              <PasswordReveal label="Kata sandi baru" password={resetResult.password} />
            </Notice>
            <p className="text-sm text-gray-600">
              Kata sandi ini hanya ditampilkan sekali. Simpan sebelum menutup dialog.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetResult(null)}
              className="w-full"
            >
              Tutup
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
