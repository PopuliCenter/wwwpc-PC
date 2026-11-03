import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';
import { MediaUploadProvider, type UploadMediaFn } from '@/contexts/MediaUploadContext';
import { QuestionRenderer } from '@/pages/respondent/SurveyFillPage';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { Skeleton, QuestionSkeleton } from '@/components/common/Skeleton';
import { Tag } from '@/components/common/Tag';
import type { Question as FillQuestion } from '@/types/survey';
import type { ValidationRules } from './surveyEditTypes';

interface BackendQuestion {
  id: string;
  type: string;
  questionText: string;
  required: boolean;
  enabled?: boolean;
  orderIndex: number;
  validationRules: ValidationRules | null;
  hasOtherOption?: boolean;
  options?: { id: string; label: string; value: string; orderIndex: number }[];
}

interface PreviewQuestion {
  /** Tipe mentah: random_arm tidak punya tampilan responden. */
  rawType: string;
  enabled: boolean;
  order: number;
  question: FillQuestion;
}

/**
 * Bentuk admin ke bentuk tampil responden, mengikuti mapQuestion di survey-fill.service.
 * Bedanya hanya randomizeOptions tidak diteruskan: pratinjau selalu menampilkan urutan
 * opsi yang tersimpan, jadi peneliti bisa memeriksanya.
 */
function mapQuestion(q: BackendQuestion, idx: number): PreviewQuestion {
  const rules = q.validationRules ?? {};
  const options = (q.options ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((o) => ({ id: o.id, label: o.label, value: o.value }));
  return {
    rawType: q.type,
    enabled: q.enabled !== false,
    order: q.orderIndex ?? idx,
    question: {
      id: q.id,
      type: q.type as FillQuestion['type'],
      text: q.questionText ?? '',
      description: rules.description,
      required: !!q.required,
      options: options.length > 0 ? options : undefined,
      matrixRows: rules.matrixRows,
      matrixColumns: rules.matrixColumns,
      scaleMin: rules.numericRange?.min ?? rules.scaleMin,
      scaleMax: rules.numericRange?.max ?? rules.scaleMax,
      hasOtherOption: !!q.hasOtherOption,
      page: 1,
      regionConfig:
        q.type === 'indonesia_region'
          ? {
              regionDepth: rules.regionDepth ?? 'village',
              lockedProvince: rules.lockedProvince ?? null,
              lockedRegency: rules.lockedRegency ?? null,
            }
          : undefined,
      ratingConfig:
        q.type === 'rating_scale'
          ? {
              ratingMax: rules.ratingMax ?? 5,
              ratingDisplayMode: rules.ratingDisplayMode ?? 'star',
              ratingMinLabel: rules.ratingMinLabel,
              ratingMaxLabel: rules.ratingMaxLabel,
            }
          : undefined,
      uniqueIdConfig:
        q.type === 'unique_id'
          ? { minLength: rules.minLength, maxLength: rules.maxLength }
          : undefined,
    },
  };
}

// Pratinjau tidak boleh mengirim apa pun. Fieldset disabled sudah mematikan semua kontrol;
// ini untuk jalur yang tidak melewati kontrol, yaitu seret berkas ke area unggah.
const previewUpload: UploadMediaFn = () =>
  Promise.reject(new Error('Pratinjau tidak mengunggah berkas.'));

const ignoreChange = () => {};

export function SurveyPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [survey, rawQuestions] = await Promise.all([
          api.get<{ title: string; description: string }>(`/surveys/${id}`),
          api.get<BackendQuestion[]>(`/surveys/${id}/questions`),
        ]);
        setTitle(survey.title);
        setDescription(survey.description ?? '');
        setQuestions((rawQuestions ?? []).map(mapQuestion).filter((q) => q.enabled));
      } catch {
        showAppNotice({ title: 'Gagal memuat survei', tone: 'error' });
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id, navigate]);

  if (loading)
    return (
      <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Card flush>
          <QuestionSkeleton />
        </Card>
      </div>
    );

  const sorted = [...questions].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/surveys/${id}/edit`)}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali ke Editor
        </Button>
        <Tag>Mode Pratinjau</Tag>
      </div>

      <Card>
        <h1 className="text-2xl text-gray-900">{title}</h1>
        {description && <p className="mt-2 text-gray-600">{description}</p>}
      </Card>

      <MediaUploadProvider value={previewUpload}>
        <div className="space-y-4">
          {sorted.map(({ question: q, rawType }, idx) => (
            <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
              <p className="text-question font-medium text-gray-900">
                {idx + 1}.{' '}
                {q.text || <span className="font-normal text-gray-500">(tanpa teks)</span>}
                {q.required && <span className="ml-1 text-danger-fg">*</span>}
              </p>
              {q.description && <p className="mt-1 text-sm text-gray-600">{q.description}</p>}
              <div className="mt-4">
                {rawType === 'random_arm' ? (
                  <Notice>Penugasan acak: diatur otomatis dan tidak tampil ke responden.</Notice>
                ) : (
                  // Komponen yang sama dengan layar responden, tetapi tanpa jawaban: semua
                  // kontrol nonaktif dan tidak ada yang disimpan.
                  <fieldset disabled className="min-w-0">
                    <QuestionRenderer
                      question={q}
                      value={null}
                      onChange={ignoreChange}
                      surveyId={id ?? ''}
                    />
                  </fieldset>
                )}
              </div>
            </div>
          ))}
        </div>
      </MediaUploadProvider>

      {sorted.length === 0 && (
        <div className="py-8 text-center text-gray-600">Survei ini belum memiliki pertanyaan.</div>
      )}
    </div>
  );
}
