import { useState, useEffect } from 'react';
import { getDoctorLessonComments, replyToLessonComment, setLessonCommentHidden } from '../lib/api';

const formatWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Doctor panel: read patient comments on lessons, reply, and hide inappropriate ones. */
const DoctorLessonComments = ({ moduleId, moduleTitle, onClose, onChanged }) => {
  const [status, setStatus] = useState('awaiting');
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getDoctorLessonComments({ status, ...(moduleId ? { module_id: moduleId } : {}) })
      .then(({ data }) => {
        if (!cancelled) setThreads(data.comments || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load comments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, moduleId]);

  const handleReply = async (thread) => {
    const body = (drafts[thread.id] || '').trim();
    if (!body) return;
    setBusy(thread.id);
    setError('');
    try {
      const { data } = await replyToLessonComment(thread.id, body);
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, awaiting_reply: false, replies: [...t.replies, data.reply] } : t))
      );
      setDrafts((d) => ({ ...d, [thread.id]: '' }));
      onChanged?.();
    } catch {
      setError('Could not send your reply. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleHidden = async (thread, hidden, replyId) => {
    setBusy(replyId || thread.id);
    setError('');
    try {
      await setLessonCommentHidden(replyId || thread.id, hidden);
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== thread.id) return t;
          if (!replyId) return { ...t, hidden, awaiting_reply: !hidden && !t.replies.some((r) => !r.hidden) };
          const replies = t.replies.map((r) => (r.id === replyId ? { ...r, hidden } : r));
          return { ...t, replies, awaiting_reply: !t.hidden && !replies.some((r) => !r.hidden) };
        })
      );
      onChanged?.();
    } catch {
      setError('Could not update that comment.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl min-h-screen sm:min-h-0 sm:max-h-[90vh] shadow-2xl border border-amber-100 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-amber-100">
          <div className="min-w-0">
            <h3 className="font-headline-md text-amber-900 font-bold text-lg">Patient comments</h3>
            <p className="text-xs text-on-surface-variant truncate">{moduleTitle || 'All lessons'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-amber-50 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-1.5">
          {[
            { id: 'awaiting', label: 'Awaiting reply' },
            { id: 'all', label: 'All comments' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (f.id === status) return;
                setLoading(true);
                setStatus(f.id);
              }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                status === f.id
                  ? 'bg-amber-900 text-white border-amber-900'
                  : 'bg-surface-container-low text-amber-950 border-outline-variant/40 hover:bg-amber-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="px-6 pt-3 text-xs text-rose-700">{error}</p>}

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-on-surface-variant italic">Loading comments…</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">
              {status === 'awaiting' ? 'No comments are waiting for a reply.' : 'No comments yet.'}
            </p>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                className={`rounded-xl border p-3 space-y-2 ${t.hidden ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-amber-100'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-semibold text-amber-950">{t.patient.name}</span> · {formatWhen(t.created_at)}
                      {!moduleId && <> · <span className="italic">{t.module_title}</span></>}
                    </p>
                    <p className="text-sm text-on-surface whitespace-pre-wrap mt-0.5">{t.body}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {t.awaiting_reply && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Awaiting reply
                      </span>
                    )}
                    {t.hidden && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Hidden</span>
                    )}
                    <button
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => handleHidden(t, !t.hidden)}
                      className="text-[11px] font-semibold text-on-surface-variant hover:text-rose-700 px-1.5 py-1 cursor-pointer disabled:opacity-50"
                    >
                      {t.hidden ? 'Show' : 'Hide'}
                    </button>
                  </div>
                </div>

                {t.replies.length > 0 && (
                  <ul className="space-y-2 pl-3 border-l-2 border-primary/30">
                    {t.replies.map((r) => (
                      <li key={r.id} className={r.hidden ? 'opacity-60' : ''}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-primary font-semibold">
                            {r.author.name} <span className="font-normal text-on-surface-variant">· {formatWhen(r.created_at)}</span>
                            {r.hidden && <span className="ml-1 text-gray-600 font-normal">(hidden)</span>}
                          </p>
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => handleHidden(t, !r.hidden, r.id)}
                            className="text-[11px] text-on-surface-variant hover:text-rose-700 cursor-pointer disabled:opacity-50"
                          >
                            {r.hidden ? 'Show' : 'Hide'}
                          </button>
                        </div>
                        <p className="text-sm text-on-surface whitespace-pre-wrap">{r.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {!t.hidden && (
                  <div className="flex gap-2 pt-1">
                    <textarea
                      rows={2}
                      value={drafts[t.id] || ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                      maxLength={2000}
                      placeholder="Write a reply (all patients can see it)…"
                      className="flex-1 px-3 py-2 text-sm border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary outline-none resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => handleReply(t)}
                      disabled={busy === t.id || !(drafts[t.id] || '').trim()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 self-end cursor-pointer disabled:opacity-40"
                    >
                      {busy === t.id ? 'Sending…' : 'Reply'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorLessonComments;
