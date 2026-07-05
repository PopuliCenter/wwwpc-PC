import { useState } from 'react';
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

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-lg mb-3">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-300 hover:text-gray-500 text-lg leading-none"
          title="Geser untuk mengurutkan"
        >
          ⠿
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {question.text || <span className="text-gray-400 italic">Pertanyaan baru</span>}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{questionTypeLabels[question.type]}</span>
            {question.required && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                Wajib
              </span>
            )}
            {hasLogic && (
              <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                Aturan
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setTab('edit');
              onOpen();
            }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${expanded ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {expanded ? 'Tutup' : 'Edit'}
          </button>
          <button
            onClick={() => onDuplicate(question)}
            className="px-2 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
            title="Duplikat"
          >
            ⧉
          </button>
          <button
            onClick={() => onDelete(question.id)}
            className="px-2 py-1.5 text-xs bg-red-50 text-red-500 rounded-md hover:bg-red-100"
            title="Hapus"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Editor modal (popup) */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={onClose}
        >
          <div
            className="my-6 w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">
                {question.text.trim() ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
              </h3>
              <button
                onClick={onClose}
                className="text-lg leading-none text-gray-400 hover:text-gray-600"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-4">
              {(['edit', 'logic', 'validation'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    tab === t
                      ? 'border-primary-500 text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'edit'
                    ? '✏️ Pertanyaan'
                    : t === 'logic'
                      ? '🔀 Aturan Tampil'
                      : '✅ Batasan Isian'}
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Penjelasan tambahan untuk responden..."
                    />
                  </div>

                  {/* Status pertanyaan: Wajib / Opsional / Nonaktif */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Status pertanyaan
                    </label>
                    <div className="inline-flex rounded-md border border-gray-300 p-0.5">
                      {(
                        [
                          { key: 'required', label: 'Wajib' },
                          { key: 'optional', label: 'Opsional' },
                          { key: 'disabled', label: 'Nonaktif' },
                        ] as const
                      ).map((opt) => {
                        const mode =
                          question.enabled === false
                            ? 'disabled'
                            : question.required
                              ? 'required'
                              : 'optional';
                        const active = mode === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              if (opt.key === 'required')
                                onEdit({ ...question, required: true, enabled: true });
                              else if (opt.key === 'optional')
                                onEdit({ ...question, required: false, enabled: true });
                              else onEdit({ ...question, enabled: false });
                            }}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {question.enabled === false && (
                      <p className="mt-1 text-xs text-amber-600">
                        Pertanyaan ini tidak ditampilkan ke responden.
                      </p>
                    )}
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
                  <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                    Batasan untuk jawaban (mis. panjang minimal/maksimal). Semua opsional — boleh
                    dibiarkan kosong bila tidak diperlukan.
                  </p>
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
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
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
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            min={1}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
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
                            className="rounded"
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
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
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
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
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
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          min={1}
                        />
                      </div>
                    </div>
                  )}
                  {!['short_text', 'long_text', 'multiple_choice'].includes(question.type) && (
                    <p className="text-xs text-gray-400 italic">
                      Tidak ada opsi validasi tambahan untuk tipe ini.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => onDelete(question.id)}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Hapus pertanyaan
              </button>
              <button
                onClick={onClose}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
