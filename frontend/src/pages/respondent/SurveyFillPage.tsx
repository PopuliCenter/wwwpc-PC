import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

// Types
interface SurveyOption {
  id: string;
  label: string;
  value: string;
}

interface SkipCondition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

interface Question {
  id: string;
  type:
    | 'single_choice'
    | 'multiple_choice'
    | 'short_text'
    | 'long_text'
    | 'phone_number'
    | 'numeric_scale'
    | 'dropdown'
    | 'matrix_likert'
    | 'file_upload'
    | 'date_time';
  text: string;
  description?: string;
  required: boolean;
  options?: SurveyOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  scaleMin?: number;
  scaleMax?: number;
  randomizeOptions?: boolean;
  skipConditions?: SkipCondition[];
  visibilityConditions?: SkipCondition[];
  page: number;
}

interface SurveyFillData {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  totalPages: number;
  maxDuration?: number; // in minutes
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  responseId: string;
}

type AnswerValue = string | string[] | Record<string, string> | null;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Question Renderers
function SingleChoiceQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const options = question.randomizeOptions
    ? shuffleArray(question.options ?? [])
    : (question.options ?? []);

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
          <input
            type="radio"
            name={question.id}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="w-4 h-4 text-blue-600"
          />
          <span className="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function MultipleChoiceQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const selected = Array.isArray(value) ? value : [];
  const options = question.randomizeOptions
    ? shuffleArray(question.options ?? [])
    : (question.options ?? []);

  const handleToggle = (optValue: string) => {
    const newSelected = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(newSelected);
  };

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            value={opt.value}
            checked={selected.includes(opt.value)}
            onChange={() => handleToggle(opt.value)}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function ShortTextQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ketik jawaban Anda..."
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      aria-label={question.text}
    />
  );
}

function LongTextQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  return (
    <textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ketik jawaban Anda..."
      rows={4}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
      aria-label={question.text}
    />
  );
}

function PhoneNumberQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600">
        +62
      </span>
      <input
        type="tel"
        value={(value as string) ?? ''}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9]/g, '');
          onChange(cleaned);
        }}
        placeholder="8xxxxxxxxxx"
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        aria-label={question.text}
      />
    </div>
  );
}

function NumericScaleQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 10;
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-wrap gap-2">
      {numbers.map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => onChange(String(num))}
          className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
            value === String(num)
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  );
}

function DropdownQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const options = question.randomizeOptions
    ? shuffleArray(question.options ?? [])
    : (question.options ?? []);

  return (
    <select
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      aria-label={question.text}
    >
      <option value="">Pilih jawaban...</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function MatrixLikertQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const rows = question.matrixRows ?? [];
  const columns = question.matrixColumns ?? [];
  const answers = (value as Record<string, string>) ?? {};

  const handleChange = (row: string, col: string) => {
    onChange({ ...answers, [row]: col });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500"></th>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row}>
              <td className="px-3 py-3 text-sm text-gray-700">{row}</td>
              {columns.map((col) => (
                <td key={col} className="px-3 py-3 text-center">
                  <input
                    type="radio"
                    name={`${question.id}-${row}`}
                    checked={answers[row] === col}
                    onChange={() => handleChange(row, col)}
                    className="w-4 h-4 text-blue-600"
                    aria-label={`${row} - ${col}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileUploadQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileName = (value as string) ?? '';

  const handleFile = (file: File) => {
    onChange(file.name);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      {fileName ? (
        <div className="space-y-2">
          <p className="text-sm text-green-600 font-medium">✓ File terpilih: {fileName}</p>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Hapus file
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Drag & drop file di sini, atau</p>
          <label className="inline-block cursor-pointer">
            <span className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              Pilih File
            </span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              aria-label={question.text}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function DateTimeQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  return (
    <input
      type="datetime-local"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      aria-label={question.text}
    />
  );
}

// Question Renderer
function QuestionRenderer({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
}) {
  const renderers: Record<Question['type'], React.FC<{ question: Question; value: AnswerValue; onChange: (val: AnswerValue) => void }>> = {
    single_choice: SingleChoiceQuestion,
    multiple_choice: MultipleChoiceQuestion,
    short_text: ShortTextQuestion,
    long_text: LongTextQuestion,
    phone_number: PhoneNumberQuestion,
    numeric_scale: NumericScaleQuestion,
    dropdown: DropdownQuestion,
    matrix_likert: MatrixLikertQuestion,
    file_upload: FileUploadQuestion,
    date_time: DateTimeQuestion,
  };

  const Renderer = renderers[question.type];
  if (!Renderer) return <p className="text-red-500 text-sm">Tipe pertanyaan tidak didukung</p>;

  return <Renderer question={question} value={value} onChange={onChange} />;
}

// Countdown Timer
function CountdownTimer({ minutes, onExpire }: { minutes: number; onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, onExpire]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isWarning = secondsLeft < 300; // less than 5 minutes

  return (
    <div
      className={`fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg font-mono text-lg z-50 ${
        isWarning ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 text-white'
      }`}
    >
      ⏱️ {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  );
}

// Progress Bar
function ProgressBar({ current, total }: { current: number; total: number }) {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Halaman {current} dari {total}</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

// Main Component
export function SurveyFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyFillData | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [destinationNumber, setDestinationNumber] = useState('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef<string>('');

  // Load survey
  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const result = await api.get<SurveyFillData>(`/surveys/${id}/fill`);
        setSurvey(result);
      } catch {
        setError('Gagal memuat survei');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!survey) return;

    autoSaveTimerRef.current = setInterval(() => {
      const currentAnswersStr = JSON.stringify(answers);
      if (currentAnswersStr !== lastSavedRef.current) {
        api.post(`/responses/${survey.responseId}/progress`, { answers, currentPage }).catch(() => {
          // Silent fail for auto-save
        });
        lastSavedRef.current = currentAnswersStr;
      }
    }, 30000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [survey, answers, currentPage]);

  // Evaluate skip/visibility conditions
  const evaluateCondition = useCallback(
    (condition: SkipCondition): boolean => {
      const answer = answers[condition.questionId];
      const answerStr = Array.isArray(answer) ? answer.join(',') : String(answer ?? '');

      switch (condition.operator) {
        case 'equals':
          return answerStr === condition.value;
        case 'not_equals':
          return answerStr !== condition.value;
        case 'contains':
          return answerStr.includes(condition.value);
        case 'greater_than':
          return Number(answerStr) > Number(condition.value);
        case 'less_than':
          return Number(answerStr) < Number(condition.value);
        default:
          return false;
      }
    },
    [answers]
  );

  const isQuestionVisible = useCallback(
    (question: Question): boolean => {
      if (!question.visibilityConditions || question.visibilityConditions.length === 0) {
        return true;
      }
      return question.visibilityConditions.every(evaluateCondition);
    },
    [evaluateCondition]
  );

  const shouldSkipQuestion = useCallback(
    (question: Question): boolean => {
      if (!question.skipConditions || question.skipConditions.length === 0) {
        return false;
      }
      return question.skipConditions.some(evaluateCondition);
    },
    [evaluateCondition]
  );

  const handleSubmit = useCallback(async () => {
    if (!survey) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { answers };
      if (survey.rewardMode === 'manual' && destinationNumber) {
        payload.destinationNumber = destinationNumber;
      }
      const result = await api.post<{ pointsEarned: number }>('/responses/submit', {
        responseId: survey.responseId,
        surveyId: survey.id,
        ...payload,
      });
      setEarnedPoints(result?.pointsEarned ?? 0);
      setSubmitted(true);
    } catch {
      setError('Gagal mengirim jawaban. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [survey, answers, destinationNumber]);

  const handleTimerExpire = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white rounded-lg shadow p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-2/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900">Terima Kasih!</h2>
          <p className="text-gray-600">Jawaban Anda telah berhasil dikirim.</p>
          {earnedPoints > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-700 font-medium">
                +{earnedPoints} poin telah ditambahkan ke saldo Anda!
              </p>
            </div>
          )}
          <button
            onClick={() => navigate('/surveys')}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Kembali ke Daftar Survei
          </button>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  // Get questions for current page
  const pageQuestions = survey.questions
    .filter((q) => q.page === currentPage)
    .filter((q) => isQuestionVisible(q))
    .filter((q) => !shouldSkipQuestion(q));

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const goToNextPage = () => {
    if (currentPage < survey.totalPages) {
      setCurrentPage((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const isLastPage = currentPage === survey.totalPages;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Timer */}
      {survey.maxDuration && (
        <CountdownTimer minutes={survey.maxDuration} onExpire={handleTimerExpire} />
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-gray-900">{survey.title}</h1>
        <p className="text-sm text-gray-600 mt-1">{survey.description}</p>

        {/* Reward info banner */}
        {survey.rewardMode === 'manual' && survey.rewardDescription && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <span className="font-medium">🎁 Reward:</span> {survey.rewardDescription}
            </p>
          </div>
        )}
        {survey.rewardMode === 'auto_point' && survey.rewardPoints && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-700">
              <span className="font-medium">🎁 Reward:</span> {survey.rewardPoints} poin otomatis setelah menyelesaikan survei
            </p>
          </div>
        )}
      </div>

      {/* Progress */}
      <ProgressBar current={currentPage} total={survey.totalPages} />

      {/* Questions */}
      <div className="space-y-6">
        {pageQuestions.map((question, idx) => (
          <div key={question.id} className="bg-white rounded-lg shadow p-6">
            <div className="mb-4">
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-gray-400">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {question.text}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  {question.description && (
                    <p className="text-xs text-gray-500 mt-1">{question.description}</p>
                  )}
                </div>
              </div>
            </div>
            <QuestionRenderer
              question={question}
              value={answers[question.id] ?? null}
              onChange={(val) => handleAnswerChange(question.id, val)}
            />
          </div>
        ))}
      </div>

      {/* Manual reward destination number */}
      {isLastPage && survey.rewardMode === 'manual' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Nomor Tujuan Reward <span className="text-red-500">*</span>
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Masukkan nomor telepon/e-wallet untuk menerima reward
          </p>
          <div className="flex items-center gap-2">
            <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600">
              +62
            </span>
            <input
              type="tel"
              value={destinationNumber}
              onChange={(e) => setDestinationNumber(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="8xxxxxxxxxx"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevPage}
          disabled={currentPage === 1}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Sebelumnya
        </button>

        {isLastPage ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
          </button>
        ) : (
          <button
            type="button"
            onClick={goToNextPage}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Selanjutnya →
          </button>
        )}
      </div>
    </div>
  );
}
