export type ShareKind = 'club' | 'event' | 'profile';

export function formatSharePreview(kind: ShareKind, senderIsMe: boolean) {
  const noun = kind === 'profile' ? 'profile' : kind;
  return senderIsMe ? `You shared a ${noun}` : `Shared a ${noun} with you`;
}

export function formatMessagePreview(params: { content: string | null | undefined; senderIsMe: boolean }) {
  const raw = String(params.content || '').trim();
  if (!raw) return '';

  if (raw.startsWith('SHARE_CLUB|')) return formatSharePreview('club', params.senderIsMe);
  if (raw.startsWith('SHARE_EVENT|')) return formatSharePreview('event', params.senderIsMe);
  if (raw.startsWith('SHARE_CONNECTION|')) return formatSharePreview('profile', params.senderIsMe);

  return raw;
}

