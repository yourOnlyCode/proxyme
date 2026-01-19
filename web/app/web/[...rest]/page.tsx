import { redirect } from 'next/navigation';

export default async function WebCatchAllRedirect({
  params,
}: {
  params: Promise<{ rest?: string[] }>;
}) {
  const resolvedParams = await params;
  const restPath = resolvedParams.rest?.join('/') ?? '';
  redirect(`/${restPath}`);
}

