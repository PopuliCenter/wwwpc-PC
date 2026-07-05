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
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
        >
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
        className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
        placeholder="nilai..."
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Penjelasan singkat untuk pengguna awam */}
      <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        Atur pertanyaan ini agar <b>muncul atau hilang otomatis</b> tergantung jawaban pertanyaan
        sebelumnya. Contoh: tampilkan "Akun Instagram" hanya jika responden menjawab "Ya" pada
        "Punya Instagram?".
      </div>

      {/* Skip Logic */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
            Sembunyikan otomatis
          </h4>
          <button
            onClick={() => setSkip([...skipRules, blankSkip()])}
            className="text-xs text-purple-600 hover:text-purple-800"
          >
            + Tambah Aturan
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Sembunyikan pertanyaan ini jika kondisi terpenuhi.
        </p>
        {skipRules.length === 0 && (
          <p className="text-xs text-gray-400 italic">Tidak ada skip logic.</p>
        )}
        {skipRules.map((rule, idx) => (
          <div
            key={idx}
            className="bg-purple-50 border border-purple-100 rounded p-2 mb-2 space-y-2"
          >
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setSkip(n);
                  }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
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
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setSkip(n);
                  }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
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
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...skipRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setSkip(n);
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Aksi:</span>
                <select
                  value={rule.action}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, action: e.target.value as 'skip' | 'jump_to' };
                    setSkip(n);
                  }}
                  className="px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  <option value="skip">Sembunyikan pertanyaan ini</option>
                  <option value="jump_to">Lompat ke pertanyaan lain</option>
                </select>
                {rule.action === 'jump_to' && (
                  <select
                    value={rule.targetQuestionId ?? ''}
                    onChange={(e) => {
                      const n = [...skipRules];
                      n[idx] = { ...rule, targetQuestionId: e.target.value };
                      setSkip(n);
                    }}
                    className="px-1.5 py-1 border border-purple-200 rounded text-xs"
                  >
                    <option value="">— tujuan —</option>
                    {others.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.text ? q.text.slice(0, 25) : `Q${q.order + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={() => setSkip(skipRules.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Visibility Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Tampilkan otomatis
          </h4>
          <button
            onClick={() => setVis([...visRules, blankVis()])}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Tambah Kondisi
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Tampilkan/sembunyikan pertanyaan ini berdasarkan jawaban pertanyaan lain.
        </p>
        {visRules.length === 0 && <p className="text-xs text-gray-400 italic">Selalu tampil.</p>}
        {visRules.map((rule, idx) => (
          <div key={idx} className="bg-blue-50 border border-blue-100 rounded p-2 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setVis(n);
                  }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
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
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setVis(n);
                  }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
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
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...visRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setVis(n);
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Maka:</span>
                <select
                  value={rule.visibilityAction}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, visibilityAction: e.target.value as 'show' | 'hide' };
                    setVis(n);
                  }}
                  className="px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  <option value="show">Tampilkan pertanyaan ini</option>
                  <option value="hide">Sembunyikan pertanyaan ini</option>
                </select>
              </div>
              <button
                onClick={() => setVis(visRules.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sortable Question Card ───────────────────────────────────────────────────
