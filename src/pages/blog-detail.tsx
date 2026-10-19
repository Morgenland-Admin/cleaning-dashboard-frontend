import { Navigate, useParams } from 'react-router-dom';

/** The editor is the post's record page; old /blog/:id links land there. */
export function BlogDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={/^\d+$/.test(id ?? '') ? `/blog/${id}/edit` : '/blog'} replace />;
}
