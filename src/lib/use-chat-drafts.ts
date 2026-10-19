import { useCallback, useEffect, useRef, useState } from 'react';

import { errMessage, uploadsAdminApi, type ChatAttachment } from '@/lib/api';
import { checkFiles, fileType, type FileProblem } from '@/lib/chat';

import type { CompanySlug } from '@/contexts/project-context';

// Browsers cannot draw HEIC, so those get the file icon.
const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface DraftFile {
  id: string;
  name: string;
  size: number;
  /** Object URL for image thumbnails while composing. */
  previewUrl: string | null;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  result?: ChatAttachment;
  error?: string;
  file: File;
}

/** Files attached to the message being written: validated, uploaded straight to S3, retryable. */
export function useChatDrafts(
  companySlug: CompanySlug,
  onRejected: (rejected: Array<{ name: string; problem: FileProblem }>) => void,
) {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  });
  useEffect(
    () => () => filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)),
    [],
  );

  const patch = useCallback((id: string, next: Partial<DraftFile>) => {
    setFiles((curr) => curr.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  const upload = useCallback(
    (draft: DraftFile) => {
      uploadsAdminApi
        .uploadDirect(companySlug, draft.file, {
          onProgress: (progress) => patch(draft.id, { progress }),
        })
        .then((result) => patch(draft.id, { status: 'done', progress: 1, result }))
        .catch((err: unknown) => patch(draft.id, { status: 'error', error: errMessage(err) }));
    },
    [companySlug, patch],
  );

  const add = useCallback(
    (picked: FileList | File[] | null) => {
      if (!picked || picked.length === 0) return;
      const { ok, rejected } = checkFiles(Array.from(picked), filesRef.current.length);
      if (rejected.length) {
        onRejected(rejected.map((r) => ({ name: r.file.name, problem: r.problem })));
      }
      const drafts = ok.map<DraftFile>((raw) => {
        const type = fileType(raw);
        const file = raw.type === type ? raw : new File([raw], raw.name, { type });
        return {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          previewUrl: PREVIEWABLE.has(type) ? URL.createObjectURL(file) : null,
          status: 'uploading',
          progress: 0,
          file,
        };
      });
      if (drafts.length === 0) return;
      setFiles((curr) => [...curr, ...drafts]);
      drafts.forEach(upload);
    },
    [onRejected, upload],
  );

  const remove = useCallback((id: string) => {
    setFiles((curr) => {
      const gone = curr.find((f) => f.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return curr.filter((f) => f.id !== id);
    });
  }, []);

  const retry = useCallback(
    (id: string) => {
      const draft = filesRef.current.find((f) => f.id === id);
      if (!draft) return;
      patch(id, { status: 'uploading', progress: 0, error: undefined });
      upload(draft);
    },
    [patch, upload],
  );

  /** Hands the uploaded files to a message; failed ones stay in the tray. */
  const take = useCallback((): ChatAttachment[] => {
    const done = filesRef.current.filter((f) => f.status === 'done' && f.result);
    done.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    const ids = new Set(done.map((f) => f.id));
    setFiles((curr) => curr.filter((f) => !ids.has(f.id)));
    return done.map((f) => f.result!);
  }, []);

  return {
    files,
    add,
    remove,
    retry,
    take,
    uploading: files.some((f) => f.status === 'uploading'),
    ready: files.filter((f) => f.status === 'done').length,
  };
}
