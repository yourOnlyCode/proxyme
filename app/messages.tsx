import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { getUserConnectionsList } from '@/lib/connections';
import { formatMessagePreview } from '@/lib/messagePreview';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Conversation = {
  id: string;
  partner: { id: string; username: string; avatar_url: string | null };
  last_message: { content: string; created_at: string; sender_id: string } | null;
  unread_count?: number;
  created_at?: string;
};

function Avatar({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View className="w-12 h-12 bg-gray-300 rounded-full overflow-hidden">
      {url ? (
        <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="w-full h-full items-center justify-center bg-gray-200">
          <Text className="text-gray-400 font-bold">?</Text>
        </View>
      )}
    </View>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [composeConnections, setComposeConnections] = useState<Array<{ conversationId: string; partner: { id: string; username: string; full_name: string | null; avatar_url: string | null } }>>([]);

  const fetchConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    const silent = !!opts?.silent;
    if (!silent) setRefreshing(true);
    try {
      const { data } = await supabase.rpc('get_my_inbox_conversations');
      const rows = (data as any[]) || [];
      const mapped: Conversation[] = rows.map((row) => ({
        id: row.id,
        created_at: row.connection_created_at,
        partner: {
          id: row.partner_id,
          username: row.partner_username,
          avatar_url: row.partner_avatar_url,
        },
        last_message: row.last_message_created_at
          ? {
              content: row.last_message_content,
              created_at: row.last_message_created_at,
              sender_id: row.last_message_sender_id,
            }
          : null,
        unread_count: row.unread_count || 0,
      }));
      mapped.sort((a, b) => {
        const at = a.last_message?.created_at || a.created_at || '';
        const bt = b.last_message?.created_at || b.created_at || '';
        return new Date(bt).getTime() - new Date(at).getTime();
      });
      setConversations(mapped);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchConversations({ silent: true });
  }, [fetchConversations]);

  useFocusEffect(
    useCallback(() => {
      void fetchConversations({ silent: true });
    }, [fetchConversations]),
  );

  const openCompose = useCallback(async () => {
    if (!user?.id) return;
    setComposeVisible(true);
    setComposeSearch('');
    setComposeLoading(true);
    try {
      const partners = await getUserConnectionsList({ targetUserId: user.id });
      const partnerIds = partners.map((p) => p.id).filter(Boolean);
      if (partnerIds.length === 0) {
        setComposeConnections([]);
        return;
      }

      // Try to resolve conversation ids in one query from interests (accepted connections).
      // Conversation id == interests.id in this app.
      const inList = `(${partnerIds.map((id) => `"${id}"`).join(',')})`;
      const { data: interestRows } = await supabase
        .from('interests')
        .select('id, sender_id, receiver_id, created_at')
        .eq('status', 'accepted')
        .or(`and(sender_id.eq.${user.id},receiver_id.in.${inList}),and(receiver_id.eq.${user.id},sender_id.in.${inList})`);

      const bestByPartner = new Map<string, { id: string; created_at: string }>();
      (interestRows as any[] | null)?.forEach((r: any) => {
        const partnerId = String(r.sender_id) === String(user.id) ? String(r.receiver_id) : String(r.sender_id);
        const prev = bestByPartner.get(partnerId);
        const ct = String(r.created_at || '');
        if (!prev || new Date(ct).getTime() > new Date(prev.created_at).getTime()) {
          bestByPartner.set(partnerId, { id: String(r.id), created_at: ct });
        }
      });

      const mapped = partners
        .map((p) => {
          const convo = bestByPartner.get(p.id);
          if (!convo?.id) return null;
          return {
            conversationId: convo.id,
            partner: { id: p.id, username: p.username || '', full_name: p.full_name || null, avatar_url: p.avatar_url || null },
          };
        })
        .filter(Boolean) as Array<{ conversationId: string; partner: { id: string; username: string; full_name: string | null; avatar_url: string | null } }>;

      setComposeConnections(mapped);
    } finally {
      setComposeLoading(false);
    }
  }, [user?.id]);

  const renderRow = useCallback(({ item }: { item: Conversation }) => {
    const unreadCount = Number(item.unread_count || 0);
    const preview = item.last_message?.content
      ? formatMessagePreview({ content: item.last_message.content, senderIsMe: String(item.last_message.sender_id) === String(user?.id) })
      : 'Say hi…';
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        className="bg-white border border-gray-100 rounded-xl p-4 mb-3 flex-row items-center"
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View className="relative">
          <View style={{ shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 4 }}>
            <Avatar path={item.partner.avatar_url} />
          </View>
          {unreadCount > 0 && (
            <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5 border-2 border-white">
              <Text className="text-white text-[10px] font-bold">{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
            </View>
          )}
        </View>
        <View className="ml-3 flex-1 pr-2">
          <Text className="font-bold text-lg mb-1">{item.partner.username}</Text>
          <Text className="text-gray-500 text-sm" numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View className="items-end">
          <View className="bg-gray-100 border border-gray-200 rounded-full w-8 h-8 items-center justify-center mb-2">
            <IconSymbol name="bubble.left.and.bubble.right" size={16} color="#64748B" />
          </View>
          <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-4 border-b border-gray-100 flex-row items-center" style={{ paddingTop: insets.top + 12 }}>
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <IconSymbol name="chevron.left" size={22} color="#111827" />
        </TouchableOpacity>
        <View className="flex-1" />
        <TouchableOpacity onPress={openCompose} className="w-10 h-10 items-center justify-center" activeOpacity={0.85}>
          <IconSymbol name="square.and.pencil" size={20} color="#111827" />
        </TouchableOpacity>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}
        >
          <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
            Messages
          </Text>
        </View>
      </View>

      <Modal transparent visible={composeVisible} animationType="fade" onRequestClose={() => setComposeVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setComposeVisible(false)}>
          <Pressable
            className="bg-white rounded-3xl mx-4 mt-24 overflow-hidden"
            onPress={() => {}}
            style={{ maxHeight: '75%' }}
          >
            <View className="px-5 py-4 border-b border-gray-100 flex-row items-center">
              <Text className="text-ink font-bold text-lg flex-1">New message</Text>
              <TouchableOpacity onPress={() => setComposeVisible(false)} className="p-2">
                <IconSymbol name="xmark" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View className="px-5 py-3 border-b border-gray-100">
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2">
                <IconSymbol name="magnifyingglass" size={16} color="#94A3B8" />
                <TextInput
                  value={composeSearch}
                  onChangeText={setComposeSearch}
                  placeholder="Search connections…"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 ml-2 text-ink py-2"
                />
              </View>
            </View>
            {composeLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator />
                <Text className="text-gray-400 mt-3">Loading…</Text>
              </View>
            ) : (
              <FlatList
                data={composeConnections.filter((c) => {
                  const q = composeSearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = `${c.partner.full_name || ''} ${c.partner.username || ''}`.toLowerCase();
                  return name.includes(q);
                })}
                keyExtractor={(c) => c.conversationId}
                contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="bg-white border border-gray-100 rounded-xl p-4 mb-3 flex-row items-center"
                    onPress={() => {
                      setComposeVisible(false);
                      router.push(`/chat/${item.conversationId}`);
                    }}
                  >
                    <Avatar path={item.partner.avatar_url} />
                    <View className="ml-3 flex-1">
                      <Text className="font-bold text-base">{item.partner.full_name || item.partner.username}</Text>
                      <Text className="text-gray-400 text-xs">@{item.partner.username}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={18} color="#CBD5E1" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View className="items-center py-10 px-8">
                    <Text className="text-gray-400 text-center">No connections found.</Text>
                  </View>
                }
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-gray-500 mt-3">Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={renderRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchConversations()} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center mt-10 px-8">
              <IconSymbol name="bubble.left.and.bubble.right" size={44} color="#CBD5E0" />
              <Text className="text-gray-500 text-base font-semibold mt-4">No messages yet</Text>
              <Text className="text-gray-400 text-sm text-center mt-2">Tap the compose icon to start a new chat.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

