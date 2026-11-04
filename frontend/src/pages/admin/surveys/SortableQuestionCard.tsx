import { useState, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Question, QuestionType } from './surveyEditTypes';
import { questionTypeLabels, typeGroups, defaultsForType } from './questionTypeMeta';
import {
  InfoHint,
  ChoiceConfig,
  ArmConfig,
  MatrixConfig,
  RatingConfig,
  RegionConfig,
  NumericConfig,
  UniqueIdConfig,
} from './questionConfigs';
import { LogicEditor } from './LogicEditor';
import { Copy, GripVertical, Pin, Shuffle, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button, useTapFeedback } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { ModalShell } from '@/components/common/ModalShell';
import { Notice } from '@/components/common/Notice';
import { RowMenu } from '@/components/common/RowMenu';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';
import { BlockChip, buildBlockColors, buildBlockLetters } from './RandomBlockPanel';

const QUESTION_STATUS_OPTIONS = [
  { key: 'required', label: 'Wajib' },
  { key: 'optional', label: 'Opsional' },
  { key: 'disabled', label: 'Nonaktif' },
] as const;

export function SortableQuestionCard({
  question,
  index,
  onEdit,
  onDelete,
  onDuplicate,
  allQuestions,
  expanded,
  onOpen,
  onClose,
}: {
  question: Question;
  index: number;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  onDuplicate: (q: Question) => void;
  allQuestions: Question[];
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: question.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  // Akordion: hanya satu pertanyaan terbuka sekaligus (dikontrol parent).
  const [tab, setTab] = useState<'edit' | 'logic' | 'validation'>('edit');

  const hasLogic =
    (question.skipLogicRules?.length ?? 0) > 0 || (question.visibilityRules?.length ?? 0) > 0;

  // Gaya dan huruf lencana blok dibagi menurut urutan blok, sama seperti di panel.
  const blockColors = useMemo(() => buildBlockColors(allQuestions), [allQuestions]);
  const blockLetters = useMemo(() => buildBlockLetters(allQuestions), [allQuestions]);
  const tap = useTapFeedback();

  return (
    <div ref={setNodeRef} style={style} className="mb-3 rounded-xl border border-gray-200 bg-panel">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 sm:flex-nowrap sm:gap-3 sm:p-4">
        <IconButton
          {...attributes}
          {...listeners}
          aria-label="Geser untuk mengurutkan"
          className="cursor-grab"
        >
          <GripVertical className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>
        <span className="w-6 shrink-0 text-center text-sm font-medium text-gray-600 tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-5rem)] sm:basis-0">
          <p className="flex min-w-0 text-sm font-medium text-gray-900">
            <span className="min-w-0 truncate">
              {question.text || <span className="font-normal text-gray-500">Pertanyaan baru</span>}
            </span>
            {question.required && (
              <span className="ml-0.5 shrink-0 text-danger-fg" title="Wajib">
                <span aria-hidden="true">*</span>
                <span className="sr-only">Wajib</span>
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-gray-600">
              {questionTypeLabels[question.type]}
              {hasLogic && ' · Aturan'}
            </span>
            {question.randomizeGroup?.trim() && (
              <span
                title={`Blok acak: ${question.randomizeGroup}`}
                className="inline-flex max-w-full"
              >
                <BlockChip
                  name={question.randomizeGroup.trim()}
                  letter={blockLetters[question.randomizeGroup.trim()]}
                  colorCls={blockColors[question.randomizeGroup.trim()]}
                >
                  <Shuffle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {question.pinPosition && (
                    <Pin
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.75}
                      aria-label="Terkunci"
                    />
                  )}
                </BlockChip>
              </span>
            )}
            {question.enabled === false && (
              <Badge tone="neutral" dot>
                Nonaktif
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setTab('edit');
              onOpen();
            }}
          >
            {expanded ? 'Tutup' : 'Edit'}
          </Button>
          <IconButton aria-label="Hapus" destructive onClick={() => onDelete(question.id)}>
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
          <RowMenu
            label="Aksi lainnya"
            items={[{ label: 'Duplikat', icon: Copy, onClick: () => onDuplicate(question) }]}
          />
        </div>
      </div>

      {/* Editor modal (popup) */}
      {expanded && (
        <ModalShell
          label={question.text.trim() ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
          onClose={onClose}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 sm:px-5">
            <h3 className="text-base font-semibold text-gray-900">
              {question.text.trim() ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
            </h3>
            <IconButton aria-label="Tutup" onClick={onClose}>
              <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          </div>
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Bagian pengaturan pertanyaan"
            className="flex overflow-x-auto border-b border-gray-200 px-1 [scrollbar-width:none] sm:px-4"
          >
            {(['edit', 'logic', 'validation'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={(e) => {
                  tap(e);
                  setTab(t);
                }}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors sm:px-4 ${
                  tab === t
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {t === 'edit' ? 'Pertanyaan' : t === 'logic' ? 'Aturan Tampil' : 'Batasan Isian'}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4">
            {tab === 'edit' && (
              <>
                {/* Teks pertanyaan */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Teks Pertanyaan
                  </label>
                  <textarea
                    value={question.text}
                    onChange={(e) => onEdit({ ...question, text: e.target.value })}
                    rows={2}
                    className={textareaCls}
                    placeholder="Tulis pertanyaan di sini..."
                  />
                </div>

                {/* Tipe pertanyaan (ubah → reset konfigurasi tipe) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tipe Pertanyaan
                  </label>
                  <select
                    value={question.type}
                    onChange={(e) => {
                      const t = e.target.value as QuestionType;
                      onEdit({
                        ...question,
                        type: t,
                        options: undefined,
                        validationRules: question.validationRules?.description
                          ? { description: question.validationRules.description }
                          : undefined,
                        ...defaultsForType(t),
                      });
                    }}
                    className={fieldCls}
                  >
                    {typeGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.types.map((type) => (
                          <option key={type} value={type}>
                            {questionTypeLabels[type]}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Deskripsi */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Deskripsi (opsional)
                  </label>
                  <input
                    type="text"
                    value={question.validationRules?.description ?? ''}
                    onChange={(e) =>
                      onEdit({
                        ...question,
                        validationRules: {
                          ...question.validationRules,
                          description: e.target.value,
                        },
                      })
                    }
                    className={fieldCls}
                    placeholder="Penjelasan tambahan untuk responden..."
                  />
                </div>

                {/* Status pertanyaan: Wajib / Opsional / Nonaktif */}
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-600">Status pertanyaan</p>
                  <SegmentedControl
                    label="Status pertanyaan"
                    options={QUESTION_STATUS_OPTIONS}
                    value={
                      question.enabled === false
                        ? 'disabled'
                        : question.required
                          ? 'required'
                          : 'optional'
                    }
                    onChange={(key) => {
                      if (key === 'required')
                        onEdit({ ...question, required: true, enabled: true });
                      else if (key === 'optional')
                        onEdit({ ...question, required: false, enabled: true });
                      else onEdit({ ...question, enabled: false });
                    }}
                  />
                  {question.enabled === false && (
                    <Notice tone="warning" className="mt-2">
                      Pertanyaan ini tidak ditampilkan ke responden.
                    </Notice>
                  )}
                </div>

                {/* Blok acak urutan — atur massal lewat tombol "Blok Acak" di atas daftar. */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Blok acak urutan
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-48 flex-1">
                      <input
                        type="text"
                        maxLength={50}
                        value={question.randomizeGroup ?? ''}
                        onChange={(e) =>
                          onEdit({ ...question, randomizeGroup: e.target.value || null })
                        }
                        placeholder="Kosongkan = tidak diacak"
                        list="nama-blok-tersedia"
                        className={fieldCls}
                      />
                    </div>
                    <label
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm lg:min-h-10 ${
                        question.randomizeGroup?.trim()
                          ? 'cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-50'
                          : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500'
                      }`}
                      title="Pertanyaan tetap di posisinya walau bloknya diacak"
                    >
                      <input
                        type="checkbox"
                        disabled={!question.randomizeGroup?.trim()}
                        checked={!!question.pinPosition}
                        onChange={(e) => onEdit({ ...question, pinPosition: e.target.checked })}
                        className="h-4 w-4 accent-primary-600"
                      />
                      <Pin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kunci posisi
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Pertanyaan dengan nama blok sama akan bertukar urutan tiap responden. Biarkan
                    kosong untuk data diri, penyaring, dan pertanyaan yang jadi syarat aturan.
                  </p>
                </div>

                {/* Konfigurasi per tipe */}
                {(question.type === 'single_choice' ||
                  question.type === 'multiple_choice' ||
                  question.type === 'dropdown') && (
                  <ChoiceConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'matrix_likert' && (
                  <MatrixConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'rating_scale' && (
                  <RatingConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'indonesia_region' && (
                  <RegionConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'numeric_scale' && (
                  <NumericConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'unique_id' && (
                  <UniqueIdConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'random_arm' && (
                  <ArmConfig question={question} onEdit={onEdit} />
                )}
              </>
            )}

            {tab === 'logic' && (
              <LogicEditor question={question} allQuestions={allQuestions} onEdit={onEdit} />
            )}

            {tab === 'validation' && (
              <div className="space-y-3">
                <Notice>
                  Batasan untuk jawaban (mis. panjang minimal/maksimal). Semua opsional — boleh
                  dibiarkan kosong bila tidak diperlukan.
                </Notice>
                {(question.type === 'short_text' || question.type === 'long_text') && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Min Karakter
                        </label>
                        <input
                          type="number"
                          value={question.validationRules?.minLength ?? ''}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                minLength: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className={fieldCls}
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Maks Karakter
                        </label>
                        <input
                          type="number"
                          value={question.validationRules?.maxLength ?? ''}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                maxLength: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className={fieldCls}
                          min={1}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm text-gray-700 lg:min-h-0">
                        <input
                          type="checkbox"
                          checked={question.validationRules?.emailFormat ?? false}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                emailFormat: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary-600"
                        />
                        Validasi format email
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Pola Regex (lanjutan)
                        <InfoHint text="Khusus pengguna mahir — pola pencocokan teks. Biarkan kosong jika tidak paham." />
                      </label>
                      <input
                        type="text"
                        value={question.validationRules?.regex ?? ''}
                        onChange={(e) =>
                          onEdit({
                            ...question,
                            validationRules: {
                              ...question.validationRules,
                              regex: e.target.value,
                            },
                          })
                        }
                        className={`${fieldCls} font-mono`}
                        placeholder="^\d{5}$"
                      />
                    </div>
                  </>
                )}
                {question.type === 'multiple_choice' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Min Pilihan
                      </label>
                      <input
                        type="number"
                        value={question.validationRules?.minCheckbox ?? ''}
                        onChange={(e) =>
                          onEdit({
                            ...question,
                            validationRules: {
                              ...question.validationRules,
                              minCheckbox: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                        className={fieldCls}
                        min={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Maks Pilihan
                      </label>
                      <input
                        type="number"
                        value={question.validationRules?.maxCheckbox ?? ''}
                        onChange={(e) =>
                          onEdit({
                            ...question,
                            validationRules: {
                              ...question.validationRules,
                              maxCheckbox: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                        className={fieldCls}
                        min={1}
                      />
                    </div>
                  </div>
                )}
                {!['short_text', 'long_text', 'multiple_choice'].includes(question.type) && (
                  <p className="text-sm text-gray-600">
                    Tidak ada opsi validasi tambahan untuk tipe ini.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 sm:px-5">
            {/* Teks merah tanpa latar: tombol danger penuh terlalu menonjol di samping Tutup. */}
            <button
              type="button"
              onClick={(e) => {
                tap(e);
                onDelete(question.id);
              }}
              className="min-h-11 rounded-lg px-2 text-sm font-medium text-danger-fg transition-colors hover:bg-gray-100 lg:min-h-10"
            >
              Hapus pertanyaan
            </button>
            <Button type="button" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
