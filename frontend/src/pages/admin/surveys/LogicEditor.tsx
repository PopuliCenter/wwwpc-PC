import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { fieldCls } from '@/components/common/fieldStyles';
import type { Question, ConditionOperator, SkipLogicRule, VisibilityRule } from './surveyEditTypes';
import { operatorLabels } from './questionTypeMeta';

/** Editor aturan LOMPAT (skip) & TAMPIL (visibility) berbasis kondisi. */
export function LogicEditor({
  question,
  allQuestions,
  onEdit,
}: {
  question: Question;
  allQuestions: Question[];
  onEdit: (q: Question) => void;
}) {
  const others = allQuestions.filter((q) => q.id !== question.id);
  const skipRules = question.skipLogicRules ?? [];
  const visRules = question.visibilityRules ?? [];

  const setSkip = (rules: SkipLogicRule[]) => onEdit({ ...question, skipLogicRules: rules });
  const setVis = (rules: VisibilityRule[]) => onEdit({ ...question, visibilityRules: rules });

  const blankSkip = (): SkipLogicRule => ({
    sourceQuestionId: '',
    operator: 'equals',
    conditionValue: '',
    action: 'skip',
  });

  const blankVis = (): VisibilityRule => ({
    sourceQuestionId: '',
    operator: 'equals',
    conditionValue: '',
    visibilityAction: 'show',
  });

  // Input "Nilai" kondisi: jika pertanyaan sumber bertipe pilihan, tampilkan
  // DROPDOWN opsinya (value = nilai opsi yang sama dgn jawaban responden) supaya
  // kondisi benar-benar cocok. Untuk teks/angka, tetap input bebas.
  const choiceTypes = new Set(['single_choice', 'multiple_choice', 'dropdown', 'random_arm']);
  const renderValueInput = (
    sourceQuestionId: string,
    value: string,
    onChange: (v: string) => void,
  ) => {
    const src = others.find((q) => q.id === sourceQuestionId);
    const opts = src && choiceTypes.has(src.type) ? (src.options ?? []) : null;
    if (opts && opts.length > 0) {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
          <option value="">— pilih nilai —</option>
          {opts.map((o) => (
            <option key={o.id} value={o.value || o.label}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldCls}
        placeholder="nilai..."
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Penjelasan singkat untuk pengguna awam */}
      <Notice>
        Atur pertanyaan ini agar <b>muncul atau hilang otomatis</b> tergantung jawaban pertanyaan
        sebelumnya. Contoh: tampilkan "Akun Instagram" hanya jika responden menjawab "Ya" pada
        "Punya Instagram?".
      </Notice>

      {/* Skip Logic */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-700">Sembunyikan otomatis</h4>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setSkip([...skipRules, blankSkip()])}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Aturan
          </Button>
        </div>
        <p className="mb-2 text-xs text-gray-600">
          Sembunyikan pertanyaan ini jika kondisi terpenuhi.
        </p>
        {skipRules.length === 0 && <p className="text-xs text-gray-500">Belum ada aturan.</p>}
        {skipRules.map((rule, idx) => (
          <div
            key={idx}
            className="mb-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setSkip(n);
                  }}
                  className={fieldCls}
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text
                        ? q.text.length > 30
                          ? q.text.slice(0, 30) + '…'
                          : q.text
                        : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setSkip(n);
                  }}
                  className={fieldCls}
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...skipRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setSkip(n);
                })}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block text-xs text-gray-600">
                  Aksi
                  <select
                    value={rule.action}
                    onChange={(e) => {
                      const n = [...skipRules];
                      n[idx] = { ...rule, action: e.target.value as 'skip' | 'jump_to' };
                      setSkip(n);
                    }}
                    className={`${fieldCls} mt-0.5`}
                  >
                    <option value="skip">Sembunyikan pertanyaan ini</option>
                    <option value="jump_to">Lompat ke pertanyaan lain</option>
                  </select>
                </label>
                {rule.action === 'jump_to' && (
                  <label className="block text-xs text-gray-600">
                    Tujuan
                    <select
                      value={rule.targetQuestionId ?? ''}
                      onChange={(e) => {
                        const n = [...skipRules];
                        n[idx] = { ...rule, targetQuestionId: e.target.value };
                        setSkip(n);
                      }}
                      className={`${fieldCls} mt-0.5`}
                    >
                      <option value="">— tujuan —</option>
                      {others.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.text ? q.text.slice(0, 25) : `Q${q.order + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <IconButton
                aria-label="Hapus aturan"
                destructive
                onClick={() => setSkip(skipRules.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      {/* Visibility Rules */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-700">Tampilkan otomatis</h4>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setVis([...visRules, blankVis()])}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Aturan
          </Button>
        </div>
        <p className="mb-2 text-xs text-gray-600">
          Atur tampil atau tidaknya pertanyaan ini berdasarkan jawaban pertanyaan lain.
        </p>
        {visRules.length === 0 && <p className="text-xs text-gray-500">Selalu tampil.</p>}
        {visRules.map((rule, idx) => (
          <div
            key={idx}
            className="mb-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setVis(n);
                  }}
                  className={fieldCls}
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text
                        ? q.text.length > 30
                          ? q.text.slice(0, 30) + '…'
                          : q.text
                        : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setVis(n);
                  }}
                  className={fieldCls}
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...visRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setVis(n);
                })}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 text-xs text-gray-600 sm:max-w-xs">
                Maka
                <select
                  value={rule.visibilityAction}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, visibilityAction: e.target.value as 'show' | 'hide' };
                    setVis(n);
                  }}
                  className={`${fieldCls} mt-0.5`}
                >
                  <option value="show">Tampilkan pertanyaan ini</option>
                  <option value="hide">Sembunyikan pertanyaan ini</option>
                </select>
              </label>
              <IconButton
                aria-label="Hapus aturan"
                destructive
                className="ml-auto"
                onClick={() => setVis(visRules.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sortable Question Card ───────────────────────────────────────────────────
