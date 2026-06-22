import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { useConfirm } from '@/components/common/ConfirmDialog';

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
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
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
        <div>
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <p className="text-sm text-green-800 font-medium">Pengguna berhasil dibuat!</p>
            <p className="text-sm text-green-700 mt-1">
              Password sementara:{' '}
              <code className="bg-green-100 px-2 py-0.5 rounded font-mono">{tempPassword}</code>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Tutup
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Nama Lengkap
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Nomor Telepon
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as CreateUserPayload['role'] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
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
    <Modal open={open} onClose={handleClose} title="Bulk Import Pengguna (CSV)">
      {result ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <p className="text-sm font-medium text-green-800">Import selesai</p>
            <p className="text-sm text-green-700 mt-1">Berhasil: {result.successCount}</p>
            <p className="text-sm text-green-700">Gagal: {result.failedCount}</p>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-red-800 mb-1">Detail Error:</p>
              {result.errors.map((err, idx) => (
                <p key={idx} className="text-xs text-red-700">
                  Baris {err.row}: {err.message}
                </p>
              ))}
            </div>
          )}
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Tutup
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Upload file CSV dengan kolom: nama, email, phone, role
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Batal
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Mengimpor...' : 'Import'}
            </button>
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

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <Modal open={open} onClose={onClose} title={`Edit Pengguna — ${user.fullName}`}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-emerald-700">Perubahan tersimpan.</p>
          <button
            onClick={onClose}
            className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Tutup
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={labelClass}>Nama Lengkap</label>
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Nomor Telepon</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>
              Password Baru <span className="text-gray-400">(kosongkan jika tidak diubah)</span>
            </label>
            <input
              type="text"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 karakter"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
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
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const totalPages = Math.ceil(total / limit);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      setActionMessage('Role berhasil diubah');
      fetchUsers();
    } catch {
      setActionMessage('Gagal mengubah role');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleToggleStatus = async (userId: string, isActive: boolean) => {
    try {
      const endpoint = isActive ? 'deactivate' : 'activate';
      await api.patch(`/users/${userId}/${endpoint}`);
      setActionMessage(isActive ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan');
      fetchUsers();
    } catch {
      setActionMessage('Gagal mengubah status');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const result = await api.post<{ temporaryPassword: string }>(
        `/users/${userId}/reset-password`
      );
      setActionMessage(`Password direset. Password baru: ${result.temporaryPassword}`);
    } catch {
      setActionMessage('Gagal mereset password');
    }
    setTimeout(() => setActionMessage(null), 8000);
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
      setActionMessage(`Akun ${user.email} dihapus.`);
      fetchUsers();
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Gagal menghapus akun';
      setActionMessage(msg);
    }
    setTimeout(() => setActionMessage(null), 8000);
  };

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm"
          >
            + Tambah Pengguna
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <div className="bg-primary-50 border border-primary-200 rounded-md p-3">
          <p className="text-sm text-primary-800">{actionMessage}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="roleFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              id="roleFilter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="">Semua Role</option>
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div>
            <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
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
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nama
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Telepon
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Dibuat
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada pengguna ditemukan
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{user.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.phone || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                          aria-label={`Role for ${user.fullName}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="analyst">Analyst</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleToggleStatus(user.id, user.isActive)}
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full cursor-pointer ${
                            user.isActive
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {user.isActive ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {format(new Date(user.createdAt), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Menampilkan {(page - 1) * limit + 1}-{Math.min(page * limit, total)} dari {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pageNum = startPage + i;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1 text-sm border rounded-md ${
                      page === pageNum
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
}
