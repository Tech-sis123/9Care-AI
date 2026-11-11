import { useState, useEffect } from 'react';
import {
  getDoctorEducationModules,
  createEducationModule,
  updateEducationModule,
  setEducationModuleStatus,
  deleteEducationModule,
} from '../lib/api';
import { getVideoSource } from '../lib/videoEmbed';
import DoctorLessonComments from './DoctorLessonComments';
import { EDUCATION_STAGES, moduleStages, normalizeStages, stageLabel } from '../lib/delivery';

const EMPTY_FORM = {
  content_type: 'video',
  title: '',
  stages: ['general'],
  summary: '',
  video_url: '',
  transcript: '',
  body: '',
  article_url: '',
  status: 'published',
};

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'video',      label: 'Videos' },
  { id: 'article',    label: 'Articles' },
  { id: 'draft',      label: 'Drafts' },
  { id: 'no_transcript', label: 'Videos without transcript' },
];

const moduleType = (m) => m.content_type || (m.video_url ? 'video' : m.audio_url ? 'audio' : 'article');

const TYPE_META = {
  video:   { icon: 'play_circle', label: 'Video',   tint: 'bg-primary/10 text-primary' },
  article: { icon: 'description', label: 'Article', tint: 'bg-amber-100 text-amber-800' },
  audio:   { icon: 'headphones',  label: 'Audio',   tint: 'bg-purple-100 text-purple-800' },
};

const errorMessage = (err, fallback) =>
  err.response?.data?.error && err.response.data.error !== 'validation_failed'
    ? err.response.data.error
    : err.response?.data?.message || err.message || fallback;

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none';

const Field = ({ label, hint, optional, error, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-amber-950 flex items-center gap-1.5">
      {label}
      {optional && <span className="text-[10px] font-medium text-on-surface-variant/70 bg-surface-container-low px-1.5 py-0.5 rounded-full">Optional</span>}
    </span>
    {children}
    {error ? (
      <span className="block text-[11px] text-rose-700">{error}</span>
    ) : (
      hint && <span className="block text-[11px] text-on-surface-variant/80">{hint}</span>
    )}
  </label>
);

const VideoPreview = ({ url }) => {
  const source = getVideoSource(url);
  if (!source) return null;
  if (source.kind === 'link') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
        <span className="material-symbols-outlined text-sm">info</span>
        <span>
          This link can't be previewed here. Patients will get a button to open it. YouTube, Vimeo, Google Drive and direct
          .mp4 links play inside the app.
        </span>
      </div>
    );
  }
  return (
    <div className="aspect-video rounded-xl overflow-hidden bg-black">
      {source.kind === 'iframe' ? (
        <iframe className="w-full h-full" src={source.src} title="Video preview" allow="encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <video className="w-full h-full object-contain" src={source.src} controls />
      )}
    </div>
  );
};

// ── Add / edit form ───────────────────────────────────────────────
const ContentEditor = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...EMPTY_FORM,
          ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, initial[k] ?? EMPTY_FORM[k]])),
          content_type: moduleType(initial) === 'video' ? 'video' : 'article',
          stages: moduleStages(initial),
          status: initial.status === 'published' ? 'published' : 'draft',
        }
      : EMPTY_FORM
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (fieldErrors[key]) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  };

  // Ticking General clears the trimesters (it already covers every week), and the other way round
  const toggleStage = (id) => {
    setForm((f) => {
      const has = f.stages.includes(id);
      let next;
      if (id === 'general') next = has ? [] : ['general'];
      else next = normalizeStages(has ? f.stages.filter((s) => s !== id) : [...f.stages.filter((s) => s !== 'general'), id]);
      return { ...f, stages: next };
    });
    if (fieldErrors.stages) setFieldErrors((fe) => ({ ...fe, stages: undefined }));
  };

  const isVideo = form.content_type === 'video';

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setFieldErrors({});
    if (!form.stages.length) {
      setFieldErrors({ stages: 'Choose at least one group' });
      setSaving(false);
      return;
    }
    const payload = { ...form };
    try {
      const { data } = isEdit
        ? await updateEducationModule(initial.id, payload)
        : await createEducationModule(payload);
      onSaved(data.module, isEdit);
    } catch (err) {
      const issues = err.response?.data?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        setFieldErrors(Object.fromEntries(issues.map((i) => [i.path || '_', i.message])));
        setSaveError('Please fix the highlighted fields.');
      } else {
        setSaveError(errorMessage(err, 'Could not save this content'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSave}
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl min-h-screen sm:min-h-0 shadow-2xl border border-amber-100 flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-amber-100 sticky top-0 bg-white sm:rounded-t-2xl z-10">
          <h3 className="font-headline-md text-amber-900 font-bold text-lg">
            {isEdit ? 'Edit Content' : isVideo ? 'Add Video' : 'Add Article'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-amber-50 cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
            {['video', 'article'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, content_type: t }))}
                className={`py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  form.content_type === t
                    ? 'bg-white text-amber-950 shadow-sm border border-outline-variant/30'
                    : 'text-on-surface-variant hover:text-amber-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">{TYPE_META[t].icon}</span>
                {TYPE_META[t].label}
              </button>
            ))}
          </div>

          <Field label="Title" error={fieldErrors.title}>
            <input type="text" value={form.title} onChange={set('title')} required minLength={3} maxLength={200} className={inputClass} placeholder={isVideo ? 'e.g. How to count your baby’s kicks' : 'e.g. Foods that build blood in pregnancy'} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-amber-950 mb-1.5">Who sees it</legend>
              <div className="space-y-1.5">
                {EDUCATION_STAGES.map((s) => {
                  const checked = form.stages.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors ${
                        checked ? 'border-primary bg-primary/5' : 'border-outline-variant/60 hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStage(s.id)}
                        className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                      />
                      <span>
                        <span className="font-medium text-on-surface">{s.label}</span>
                        <span className="text-on-surface-variant"> ({s.range})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {fieldErrors.stages ? (
                <span className="block text-[11px] text-rose-700">{fieldErrors.stages}</span>
              ) : (
                <span className="block text-[11px] text-on-surface-variant/80">Tick one or more. Patients see it while their current week is in a ticked group.</span>
              )}
            </fieldset>
            <Field label="Visibility" error={fieldErrors.status}>
              <select value={form.status} onChange={set('status')} className={inputClass}>
                <option value="published">Published (patients can see it)</option>
                <option value="draft">Draft (only doctors can see it)</option>
              </select>
            </Field>
          </div>

          <Field label="Short summary" optional hint="One or two sentences shown on the lesson card." error={fieldErrors.summary}>
            <textarea rows={2} value={form.summary} onChange={set('summary')} maxLength={2000} className={`${inputClass} resize-y`} />
          </Field>

          {isVideo ? (
            <>
              <Field label="Video link" hint="YouTube, Vimeo, Google Drive or a direct .mp4 link." error={fieldErrors.video_url}>
                <input type="url" value={form.video_url} onChange={set('video_url')} required className={`${inputClass} font-mono text-xs`} placeholder="https://www.youtube.com/watch?v=…" />
              </Field>
              <VideoPreview url={form.video_url} />
              <Field
                label="Transcript"
                optional
                hint="Shown under the video so patients can read along. Leave blank if you don't have one yet."
                error={fieldErrors.transcript}
              >
                <textarea rows={8} value={form.transcript} onChange={set('transcript')} className={`${inputClass} resize-y leading-relaxed`} placeholder="Paste the full transcript of the video…" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Article text" hint="Leave a blank line between paragraphs. You can skip this if you add a link below." error={fieldErrors.body}>
                <textarea rows={12} value={form.body} onChange={set('body')} className={`${inputClass} resize-y leading-relaxed`} placeholder="Write the article here…" />
              </Field>
              <Field label="Link to full article" optional hint="Patients get a button to read the original source." error={fieldErrors.article_url}>
                <input type="url" value={form.article_url} onChange={set('article_url')} className={`${inputClass} font-mono text-xs`} placeholder="https://…" />
              </Field>
            </>
          )}

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-base">error</span>
              {saveError}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-amber-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white sm:rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-amber-50 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-sm">save</span>
            )}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : form.status === 'published' ? 'Publish' : 'Save Draft'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Education tab ─────────────────────────────────────────────────
const DoctorEducationManager = () => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | module
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [expandedTranscript, setExpandedTranscript] = useState(null);
  const [commentStats, setCommentStats] = useState({});
  const [commentsFor, setCommentsFor] = useState(null); // null | { id?, title? }

  const refreshCommentStats = () =>
    getDoctorEducationModules()
      .then(({ data }) => setCommentStats(data?.comment_stats || {}))
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    getDoctorEducationModules()
      .then(({ data }) => {
        if (cancelled) return;
        setModules(data?.modules || []);
        setCommentStats(data?.comment_stats || {});
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not load education content'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleSaved = (saved, wasEdit) => {
    setModules((prev) => (wasEdit ? prev.map((m) => (m.id === saved.id ? saved : m)) : [saved, ...prev]));
    setEditing(null);
    flash(wasEdit ? 'Changes saved.' : saved.status === 'published' ? 'Published. Patients can now see it.' : 'Saved as draft.');
  };

  const handleToggleStatus = async (m) => {
    const next = m.status === 'published' ? 'draft' : 'published';
    setBusyId(m.id);
    try {
      const { data } = await setEducationModuleStatus(m.id, next);
      setModules((prev) => prev.map((x) => (x.id === m.id ? data.module : x)));
      flash(next === 'published' ? 'Published. Patients can now see it.' : 'Moved to drafts. Patients no longer see it.');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not change visibility'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const m = deleting;
    setBusyId(m.id);
    try {
      await deleteEducationModule(m.id);
      setModules((prev) => prev.filter((x) => x.id !== m.id));
      setDeleting(null);
      flash('Deleted.');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not delete this content'));
      setDeleting(null);
    } finally {
      setBusyId(null);
    }
  };

  const totalAwaiting = Object.values(commentStats).reduce((sum, st) => sum + (st.awaiting || 0), 0);

  const counts = {
    all: modules.length,
    video: modules.filter((m) => moduleType(m) === 'video').length,
    article: modules.filter((m) => moduleType(m) === 'article').length,
    draft: modules.filter((m) => m.status !== 'published').length,
    no_transcript: modules.filter((m) => moduleType(m) === 'video' && !m.transcript).length,
  };

  const q = search.trim().toLowerCase();
  const visible = modules.filter((m) => {
    const t = moduleType(m);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'draft' ? m.status !== 'published' : filter === 'no_transcript' ? t === 'video' && !m.transcript : t === filter);
    const matchesSearch = !q || m.title.toLowerCase().includes(q) || (m.summary || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-amber-900 text-2xl">Education Content</h2>
          <p className="font-body-md text-on-surface-variant/70 mt-1">
            Add videos and articles for patients. Published content appears on their Education page straight away.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setCommentsFor({})}
            className="px-4 py-2.5 bg-white border border-amber-200 text-amber-950 rounded-xl text-xs font-semibold hover:bg-amber-50 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">forum</span>
            Patient comments
            {totalAwaiting > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{totalAwaiting}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setEditing({ content_type: 'video' })}
            className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">video_call</span>
            Add Video
          </button>
          <button
            type="button"
            onClick={() => setEditing({ content_type: 'article' })}
            className="px-4 py-2.5 bg-amber-900 text-white rounded-xl text-xs font-semibold hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">post_add</span>
            Add Article
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600">check_circle</span>
          {notice}
        </div>
      )}
      {loadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600">error</span>
            <span>{loadError}</span>
          </div>
          <button type="button" onClick={() => setLoadError('')} className="text-rose-700 hover:text-rose-900 text-xs font-semibold cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-amber-50 rounded-2xl p-4 custom-shadow space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or summary…"
            className="w-full pl-9 pr-3 py-2 text-xs border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-amber-900 text-white border-amber-900'
                  : 'bg-surface-container-low text-amber-950 border-outline-variant/40 hover:bg-amber-50'
              }`}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-sm text-on-surface-variant custom-shadow">Loading education content…</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center custom-shadow space-y-2">
          <span className="material-symbols-outlined text-4xl text-amber-300">school</span>
          <p className="text-sm text-on-surface-variant">
            {modules.length === 0 ? 'No education content yet. Add your first video or article.' : 'Nothing matches this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => {
            const t = moduleType(m);
            const meta = TYPE_META[t] || TYPE_META.article;
            const published = m.status === 'published';
            const showTranscript = expandedTranscript === m.id;
            return (
              <div key={m.id} className="bg-white rounded-2xl p-4 custom-shadow border border-amber-50 space-y-3">
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.tint}`}>
                    <span className="material-symbols-outlined">{meta.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${published ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-on-surface-variant border-gray-200'}`}>
                        {published ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        {meta.label} · {stageLabel(m)}
                        {m.updated_at && ` · Updated ${formatDate(m.updated_at)}`}
                      </span>
                      {t === 'video' && (
                        m.transcript ? (
                          <button
                            type="button"
                            onClick={() => setExpandedTranscript(showTranscript ? null : m.id)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 cursor-pointer hover:bg-primary/15"
                          >
                            <span className="material-symbols-outlined text-[12px]">subtitles</span>
                            {showTranscript ? 'Hide transcript' : 'Transcript'}
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">No transcript</span>
                        )
                      )}
                    </div>
                    <p className="font-semibold text-amber-950 text-sm">{m.title}</p>
                    {m.summary && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{m.summary}</p>}
                    {(m.video_url || m.article_url) && (
                      <a
                        href={m.video_url || m.article_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary hover:underline font-mono truncate block mt-1 max-w-full"
                      >
                        {m.video_url || m.article_url}
                      </a>
                    )}
                  </div>
                </div>

                {showTranscript && (
                  <div className="bg-[#FAF8F5] border border-outline-variant/30 rounded-xl p-3 text-xs text-on-surface-variant whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                    {m.transcript}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-outline-variant/20">
                  {commentStats[m.id]?.total > 0 && (
                    <button
                      type="button"
                      onClick={() => setCommentsFor({ id: m.id, title: m.title })}
                      className="mr-auto px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-950 hover:bg-amber-50 flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">forum</span>
                      {commentStats[m.id].total} comment{commentStats[m.id].total !== 1 ? 's' : ''}
                      {commentStats[m.id].awaiting > 0 && (
                        <span className="text-amber-700">· {commentStats[m.id].awaiting} awaiting reply</span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-950 hover:bg-amber-50 flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => handleToggleStatus(m)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-primary hover:bg-primary/5 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">{published ? 'visibility_off' : 'publish'}</span>
                    {published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => setDeleting(m)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {commentsFor && (
        <DoctorLessonComments
          moduleId={commentsFor.id}
          moduleTitle={commentsFor.title}
          onClose={() => setCommentsFor(null)}
          onChanged={refreshCommentStats}
        />
      )}

      {editing && (
        <ContentEditor
          initial={editing.id ? editing : { ...EMPTY_FORM, content_type: editing.content_type }}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-amber-100 space-y-4">
            <h3 className="font-headline-md text-amber-900 font-bold text-lg">Delete this content?</h3>
            <p className="text-sm text-on-surface-variant">
              “{deleting.title}” will be removed for all patients, along with their completion records for it. This can't be undone.
              To hide it without deleting, use Unpublish instead.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setDeleting(null)} disabled={busyId === deleting.id} className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-amber-50 cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busyId === deleting.id}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {busyId === deleting.id ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorEducationManager;
