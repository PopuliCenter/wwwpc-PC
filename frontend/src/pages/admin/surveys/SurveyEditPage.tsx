import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/services/api';

// Types
type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text_short'
  | 'text_long'
  | 'rating_scale'
  | 'likert'
  | 'dropdown'
  | 'date'
  | 'number'
  | 'file_upload';

interface QuestionOption {
  id: string;
  text: string;
  order: number;
}

interface SkipLogic {
  condition: string;
  targetQuestionId: string;
}

interface VisibilityRule {
  dependsOnQuestionId: string;
  condition: string;
  value: string;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  order: number;
  options?: QuestionOption[];
  skipLogic?: SkipLogic;
  visibilityRule?: VisibilityRule;
  config?: Record<string, unknown>;
}

interface SurveyDetail {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  text_short: 'Teks Pendek',
  text_long: 'Teks Panjang',
  rating_scale: 'Skala Rating',
  likert: 'Likert',
  dropdown: 'Dropdown',
  date: 'Tanggal',
  number: 'Angka',
  file_upload: 'Upload File',
};

const questionTypeIcons: Record<QuestionType, string> = {
  single_choice: '⭕',
  multiple_choice: '☑️',
  text_short: '📝',
  text_long: '📄',
  rating_scale: '⭐',
  likert: '📊',
  dropdown: '📋',
  date: '📅',
  number: '🔢',
  file_upload: '📎',
};

// Sortable Question Card
function SortableQuestionCard({
  question,
  onEdit,
  onDelete,
  allQuestions,
}: {
  question: Question;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  allQuestions: Question[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [expanded, setExpanded] = useState(false);
  const [editingLogic, setEditingLogic] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
        >
          ⠿
        </button>
        <span className="text-lg">{questionTypeIcons[question.type]}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{question.text || 'Pertanyaan baru'}</span>
            {question.required && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Wajib</span>
            )}
          </div>
          <span className="text-xs text-gray-500">{questionTypeLabels[question.type]}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {expanded ? 'Tutup' : 'Edit'}
          </button>
          <button
            onClick={() => setEditingLogic(!editingLogic)}
            className="text-purple-600 hover:text-purple-800 text-sm"
          >
            Logic
          </button>
          <button
            onClick={() => onDelete(question.id)}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            Hapus
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teks Pertanyaan</label>
            <input
              type="text"
              value={question.text}
              onChange={(e) => onEdit({ ...question, text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${question.id}`}
              checked={question.required}
              onChange={(e) => onEdit({ ...question, required: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor={`required-${question.id}`} className="text-sm text-gray-700">
              Wajib diisi
            </label>
          </div>
          {(question.type === 'single_choice' ||
            question.type === 'multiple_choice' ||
            question.type === 'dropdown') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opsi Jawaban</label>
              {(question.options ?? []).map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const newOptions = [...(question.options ?? [])];
                      newOptions[idx] = { ...opt, text: e.target.value };
                      onEdit({ ...question, options: newOptions });
                    }}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder={`Opsi ${idx + 1}`}
                  />
                  <button
                    onClick={() => {
                      const newOptions = (question.options ?? []).filter((_, i) => i !== idx);
                      onEdit({ ...question, options: newOptions });
                    }}
                    className="text-red-500 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newOpt: QuestionOption = {
                    id: `opt-${Date.now()}`,
                    text: '',
                    order: (question.options ?? []).length,
                  };
                  onEdit({ ...question, options: [...(question.options ?? []), newOpt] });
                }}
                className="text-blue-600 text-sm hover:text-blue-800 mt-1"
              >
                + Tambah Opsi
              </button>
            </div>
          )}
        </div>
      )}

      {editingLogic && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <h4 className="text-sm font-medium text-purple-700">Skip Logic & Visibility</h4>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Skip ke pertanyaan</label>
            <select
              value={question.skipLogic?.targetQuestionId ?? ''}
              onChange={(e) =>
                onEdit({
                  ...question,
                  skipLogic: e.target.value
                    ? { condition: 'answered', targetQuestionId: e.target.value }
                    : undefined,
                })
              }
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="">Tidak ada skip</option>
              {allQuestions
                .filter((q) => q.id !== question.id)
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text || `Pertanyaan ${q.order + 1}`}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tampilkan jika pertanyaan lain dijawab
            </label>
            <select
              value={question.visibilityRule?.dependsOnQuestionId ?? ''}
              onChange={(e) =>
                onEdit({
                  ...question,
                  visibilityRule: e.target.value
                    ? {
                        dependsOnQuestionId: e.target.value,
                        condition: 'equals',
                        value: question.visibilityRule?.value ?? '',
                      }
                    : undefined,
                })
              }
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="">Selalu tampil</option>
              {allQuestions
                .filter((q) => q.id !== question.id)
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text || `Pertanyaan ${q.order + 1}`}
                  </option>
                ))}
            </select>
            {question.visibilityRule && (
              <input
                type="text"
                value={question.visibilityRule.value}
                onChange={(e) =>
                  onEdit({
                    ...question,
                    visibilityRule: {
                      ...question.visibilityRule!,
                      value: e.target.value,
                    },
                  })
                }
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="Nilai yang harus cocok"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SurveyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const result = await api.get<SurveyDetail>(`/surveys/${id}`);
        setSurvey(result);
        setQuestions(result.questions ?? []);
      } catch {
        alert('Gagal memuat survei');
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id, navigate]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        return reordered.map((q, idx) => ({ ...q, order: idx }));
      });
    }
  };

  const addQuestion = (type: QuestionType) => {
    const newQuestion: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      text: '',
      required: false,
      order: questions.length,
      options:
        type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown'
          ? [
              { id: `opt-${Date.now()}-1`, text: 'Opsi 1', order: 0 },
              { id: `opt-${Date.now()}-2`, text: 'Opsi 2', order: 1 },
            ]
          : undefined,
    };
    setQuestions((prev) => [...prev, newQuestion]);
    setShowTypeSelector(false);
  };

  const editQuestion = useCallback((updated: Question) => {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  }, []);

  const deleteQuestion = useCallback((qId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== qId).map((q, idx) => ({ ...q, order: idx })));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/surveys/${id}`, { questions });
      alert('Survei berhasil disimpan');
    } catch {
      alert('Gagal menyimpan survei');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat survei...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/surveys')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Kembali
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit: {survey?.title}</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/admin/surveys/${id}/preview`)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            👁️ Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Menyimpan...' : '💾 Simpan'}
          </button>
        </div>
      </div>

      {/* Question Builder */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Pertanyaan ({questions.length})
        </h2>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            {questions.map((question) => (
              <SortableQuestionCard
                key={question.id}
                question={question}
                onEdit={editQuestion}
                onDelete={deleteQuestion}
                allQuestions={questions}
              />
            ))}
          </SortableContext>
        </DndContext>

        {questions.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Belum ada pertanyaan. Klik tombol di bawah untuk menambahkan.
          </div>
        )}

        {/* Add Question Button */}
        <div className="mt-4">
          {showTypeSelector ? (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Pilih Tipe Pertanyaan</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(Object.keys(questionTypeLabels) as QuestionType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => addQuestion(type)}
                    className="flex flex-col items-center gap-1 p-3 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <span className="text-xl">{questionTypeIcons[type]}</span>
                    <span className="text-xs text-gray-700 text-center">{questionTypeLabels[type]}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowTypeSelector(false)}
                className="mt-3 text-sm text-gray-500 hover:text-gray-700"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTypeSelector(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Tambah Pertanyaan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
