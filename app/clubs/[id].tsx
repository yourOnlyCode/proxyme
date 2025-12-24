import { KeyboardToolbar } from '@/components/KeyboardDismissButton';
import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Avatar from '@/components/profile/Avatar';
import ClubForumTab from '@/components/club/ClubForumTab';
import ClubEventsTab from '@/components/club/ClubEventsTab';
import ClubMembersTab from '@/components/club/ClubMembersTab';
import ClubSettingsTab from '@/components/club/ClubSettingsTab';
import EventCard from '@/components/club/EventCard';
import { ClubDetail, ClubMember, ForumTopic, ForumReply, ClubEvent } from '@/lib/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';


export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [memberStatus, setMemberStatus] = useState<'accepted' | 'invited' | 'pending' | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'forum' | 'members' | 'events' | 'settings'>('forum');
  
  // Forum State
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicContent, setNewTopicContent] = useState('');
  const [newReply, setNewReply] = useState('');
  const [replyingToReplyId, setReplyingToReplyId] = useState<string | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editingTopic, setEditingTopic] = useState<ForumTopic | null>(null);
  const [editingReply, setEditingReply] = useState<ForumReply | null>(null);
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editTopicContent, setEditTopicContent] = useState('');
  const [editReplyContent, setEditReplyContent] = useState('');

  // Members State
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [eventMenuVisible, setEventMenuVisible] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventMenuPosition, setEventMenuPosition] = useState({ x: 0, y: 0 });

  // Events State
  const [events, setEvents] = useState<ClubEvent[]>([]);
  
  // Edit Event State
  const [editEventModalVisible, setEditEventModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventDesc, setEditEventDesc] = useState('');
  const [editEventDate, setEditEventDate] = useState<Date>(new Date());
  const [editShowDatePicker, setEditShowDatePicker] = useState(false);
  const [editShowTimePicker, setEditShowTimePicker] = useState(false);
  const [editEventLocation, setEditEventLocation] = useState('');
  const [updatingEvent, setUpdatingEvent] = useState(false);

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventDate, setNewEventDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [newEventLocation, setNewEventLocation] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Settings State
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsMaxMembers, setSettingsMaxMembers] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Store subscription references for cleanup
  const forumSubscriptionRef = useRef<any>(null);
  const rsvpSubscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (id && user) {
        fetchClubDetails();
        fetchMembership();
    }
    
    return () => {
        // Cleanup subscriptions when component unmounts
        if (forumSubscriptionRef.current) {
            supabase.removeChannel(forumSubscriptionRef.current);
            forumSubscriptionRef.current = null;
        }
        if (rsvpSubscriptionRef.current) {
            supabase.removeChannel(rsvpSubscriptionRef.current);
            rsvpSubscriptionRef.current = null;
        }
    };
  }, [id, user]);

  const fetchClubDetails = async () => {
      const { data, error } = await supabase.from('clubs').select('*').eq('id', id).single();
      if (data) {
          setClub(data);
          // Initialize settings form
          setSettingsName(data.name || '');
          setSettingsDescription(data.description || '');
          setSettingsMaxMembers(data.max_member_count?.toString() || '');
      } else console.error(error);
  };

  const updateClubSettings = async () => {
      if (!settingsName.trim()) {
          Alert.alert('Error', 'Club name is required');
          return;
      }

      setSavingSettings(true);
      try {
          const updates: any = {
              name: settingsName.trim(),
              description: settingsDescription.trim() || null,
          };

          // Only update max_member_count if a value is provided
          if (settingsMaxMembers.trim()) {
              const maxMembers = parseInt(settingsMaxMembers.trim());
              if (isNaN(maxMembers) || maxMembers < 1) {
                  Alert.alert('Error', 'Maximum member count must be a positive number');
                  setSavingSettings(false);
                  return;
              }
              // Check if current member count exceeds new limit
              const currentMemberCount = members.filter(m => m.status === 'accepted').length;
              if (currentMemberCount > maxMembers) {
                  Alert.alert('Error', `You have ${currentMemberCount} members. Maximum cannot be less than current member count.`);
                  setSavingSettings(false);
                  return;
              }
              updates.max_member_count = maxMembers;
          } else {
              updates.max_member_count = null; // Remove limit
          }

          const { error } = await supabase
              .from('clubs')
              .update(updates)
              .eq('id', id);

          if (error) throw error;

          // Refresh club details
          await fetchClubDetails();
          Alert.alert('Success', 'Club settings updated!');
      } catch (error: any) {
          Alert.alert('Error', error.message || 'Failed to update settings');
      } finally {
          setSavingSettings(false);
      }
  };

  const fetchMembership = async () => {
      const { data } = await supabase
        .from('club_members')
        .select('status, role')
        .eq('club_id', id)
        .eq('user_id', user!.id)
        .maybeSingle(); // Use maybeSingle to avoid error if row missing
      
      if (data) {
          setMemberStatus(data.status);
          setRole(data.role);
          if (data.status === 'accepted') {
              fetchTopics();
              fetchMembers();
              fetchEvents();
              subscribeToForum();
              subscribeToRSVPs();
          }
      }
      setLoading(false);
  };

  const subscribeToRSVPs = () => {
      // Clean up existing subscription if any
      if (rsvpSubscriptionRef.current) {
          supabase.removeChannel(rsvpSubscriptionRef.current);
      }
      
      const sub = supabase
        .channel(`club-rsvps-${id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'club_event_rsvps',
        }, () => {
            // Refresh events to update RSVP counts
            fetchEvents();
        })
        .subscribe();

      rsvpSubscriptionRef.current = sub;
  };

  const fetchTopics = async () => {
      const { data } = await supabase
        .from('club_forum_topics')
        .select(`
            id, title, content, created_at, updated_at, reply_count, last_reply_at, is_pinned, is_locked, created_by,
            creator:profiles!created_by (username, full_name, avatar_url)
        `)
        .eq('club_id', id)
        .order('is_pinned', { ascending: false })
        .order('last_reply_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      
      if (data) setTopics(data as any);
  };

  const fetchReplies = async (topicId: string) => {
      const { data } = await supabase
        .from('club_forum_replies')
        .select(`
            id, content, created_at, updated_at, is_edited, edited_at, parent_reply_id, created_by,
            creator:profiles!created_by (username, full_name, avatar_url)
        `)
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true });
      
      if (data) {
          // Fetch reaction counts and user reactions for each reply
          const repliesWithReactions = await Promise.all(
              (data as any[]).map(async (reply) => {
                  const { data: reactions } = await supabase
                    .from('club_forum_reactions')
                    .select('reaction_type, user_id')
                    .eq('reply_id', reply.id);
                  
                  const supportCount = reactions?.filter(r => r.reaction_type === 'support').length || 0;
                  const opposeCount = reactions?.filter(r => r.reaction_type === 'oppose').length || 0;
                  const userReaction = reactions?.find(r => r.user_id === user?.id)?.reaction_type || null;
                  
                  return {
                      ...reply,
                      support_count: supportCount,
                      oppose_count: opposeCount,
                      user_reaction: userReaction,
                      replies: [] // Will be populated by buildReplyTree
                  };
              })
          );
          
          // Build nested reply tree
          const replyTree = buildReplyTree(repliesWithReactions);
          setReplies(replyTree);
      }
  };

  const buildReplyTree = (replies: ForumReply[]): ForumReply[] => {
      const replyMap = new Map<string, ForumReply>();
      const rootReplies: ForumReply[] = [];
      
      // First pass: create map of all replies
      replies.forEach(reply => {
          replyMap.set(reply.id, { ...reply, replies: [] });
      });
      
      // Second pass: build tree structure
      replies.forEach(reply => {
          const replyWithReplies = replyMap.get(reply.id)!;
          if (reply.parent_reply_id) {
              const parent = replyMap.get(reply.parent_reply_id);
              if (parent) {
                  if (!parent.replies) parent.replies = [];
                  parent.replies.push(replyWithReplies);
              }
          } else {
              rootReplies.push(replyWithReplies);
          }
      });
      
      return rootReplies;
  };

  const fetchMembers = async () => {
      const { data } = await supabase
        .from('club_members')
        .select(`
            id, user_id, role, status,
            profile:profiles!user_id (username, full_name, avatar_url)
        `)
        .eq('club_id', id)
        .eq('status', 'accepted');
      
      if (data) setMembers(data as any);
  };

  const subscribeToForum = () => {
      // Clean up existing subscription if any
      if (forumSubscriptionRef.current) {
          supabase.removeChannel(forumSubscriptionRef.current);
      }
      
      const sub = supabase
        .channel(`club-forum-${id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'club_forum_topics',
            filter: `club_id=eq.${id}`
        }, () => {
            fetchTopics();
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'club_forum_replies',
        }, (payload) => {
            // If we're viewing a topic, refresh replies
            if (selectedTopic && payload.new.topic_id === selectedTopic.id) {
                fetchReplies(selectedTopic.id);
            }
            // Refresh topics to update reply counts
            fetchTopics();
        })
        .subscribe();
        
      forumSubscriptionRef.current = sub;
  };

  const createTopic = async () => {
      if (!newTopicTitle.trim() || !newTopicContent.trim() || !user) {
          Alert.alert('Error', 'Title and content are required');
          return;
      }

      setCreatingTopic(true);
      try {
          const { error } = await supabase
            .from('club_forum_topics')
            .insert({
                club_id: id,
                created_by: user.id,
                title: newTopicTitle.trim(),
                content: newTopicContent.trim()
            });

          if (error) throw error;

          setTopicModalVisible(false);
          setNewTopicTitle('');
          setNewTopicContent('');
          fetchTopics();
          Alert.alert('Success', 'Topic created!');
      } catch (error: any) {
          Alert.alert('Error', error.message);
      } finally {
          setCreatingTopic(false);
      }
  };

  const createReply = async (parentReplyId: string | null = null) => {
      const replyContent = parentReplyId ? editReplyContent : newReply;
      if (!replyContent.trim() || !user || !selectedTopic || replying) {
          return; // Silently return if empty or already sending
      }

      if (selectedTopic.is_locked) {
          Alert.alert('Error', 'This topic is locked');
          return;
      }

      // Clear input immediately for better UX
      const contentToSend = replyContent.trim();
      if (parentReplyId) {
          setEditReplyContent('');
      } else {
          setNewReply('');
      }
      setReplyingToReplyId(null);
      Keyboard.dismiss();

      setReplying(true);
      try {
          const { error } = await supabase
            .from('club_forum_replies')
            .insert({
                topic_id: selectedTopic.id,
                created_by: user.id,
                content: contentToSend,
                parent_reply_id: parentReplyId
            });

          if (error) throw error;

          // Refresh data
          await Promise.all([
              fetchReplies(selectedTopic.id),
              fetchTopics()
          ]);
      } catch (error: any) {
          Alert.alert('Error', error.message);
          // Restore content on error
          if (parentReplyId) {
              setEditReplyContent(contentToSend);
          } else {
              setNewReply(contentToSend);
          }
      } finally {
          setReplying(false);
      }
  };

  const editTopic = async () => {
      if (!editTopicTitle.trim() || !editTopicContent.trim() || !editingTopic || !user) {
          Alert.alert('Error', 'Title and content are required');
          return;
      }

      if (editingTopic.created_by !== user.id) {
          Alert.alert('Error', 'You can only edit your own topics');
          return;
      }

      try {
          const { error } = await supabase
            .from('club_forum_topics')
            .update({
                title: editTopicTitle.trim(),
                content: editTopicContent.trim(),
                is_edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', editingTopic.id);

          if (error) throw error;

          // Update selectedTopic immediately if it's the one being edited
          if (selectedTopic?.id === editingTopic.id) {
              setSelectedTopic({
                  ...selectedTopic,
                  title: editTopicTitle.trim(),
                  content: editTopicContent.trim(),
                  is_edited: true,
                  edited_at: new Date().toISOString()
              });
          }

          setEditingTopic(null);
          setEditTopicTitle('');
          setEditTopicContent('');
          
          // Refresh topics list and replies
          await Promise.all([
              fetchTopics(),
              selectedTopic?.id === editingTopic.id ? fetchReplies(editingTopic.id) : Promise.resolve()
          ]);
          
          Alert.alert('Success', 'Topic updated!');
      } catch (error: any) {
          Alert.alert('Error', error.message);
      }
  };

  const editReply = async () => {
      if (!editReplyContent.trim() || !editingReply || !user) {
          Alert.alert('Error', 'Reply cannot be empty');
          return;
      }

      if (editingReply.created_by !== user.id) {
          Alert.alert('Error', 'You can only edit your own replies');
          return;
      }

      try {
          const { error } = await supabase
            .from('club_forum_replies')
            .update({
                content: editReplyContent.trim(),
                is_edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', editingReply.id);

          if (error) throw error;

          setEditingReply(null);
          setEditReplyContent('');
          if (selectedTopic) {
              fetchReplies(selectedTopic.id);
          }
          Alert.alert('Success', 'Reply updated!');
      } catch (error: any) {
          Alert.alert('Error', error.message);
      }
  };

  const deleteReply = async (replyId: string) => {
      if (!user) return;

      Alert.alert(
          'Delete Reply',
          'Are you sure you want to delete this reply?',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          const { error } = await supabase
                            .from('club_forum_replies')
                            .delete()
                            .eq('id', replyId)
                            .eq('created_by', user.id);

                          if (error) throw error;

                          if (selectedTopic) {
                              fetchReplies(selectedTopic.id);
                              fetchTopics(); // Refresh to update reply counts
                          }
                      } catch (error: any) {
                          Alert.alert('Error', error.message);
                      }
                  }
              }
          ]
      );
  };

  const viewUserProfile = async (userId: string) => {
      try {
          const { data: profileData, error } = await supabase
              .from('profiles')
              .select(`
                  id,
                  username,
                  full_name,
                  bio,
                  avatar_url,
                  detailed_interests,
                  relationship_goals,
                  is_verified,
                  city,
                  state,
                  social_links
              `)
              .eq('id', userId)
              .single();

          if (error) throw error;

          // Fetch photos
          const { data: photosData } = await supabase
              .from('profile_photos')
              .select('image_url, display_order')
              .eq('user_id', userId)
              .order('display_order');

          const profile: ProfileData = {
              ...profileData,
              photos: (photosData || []).map(p => ({ url: p.image_url, order: p.display_order }))
          };

          setSelectedProfile(profile);
          setProfileModalVisible(true);
      } catch (error: any) {
          Alert.alert('Error', 'Failed to load profile');
      }
  };

  const toggleReaction = async (topicId: string | null, replyId: string | null, reactionType: 'support' | 'oppose') => {
      if (!user) return;

      try {
          // Check if user already has a reaction
          const { data: existing } = await supabase
            .from('club_forum_reactions')
            .select('id, reaction_type')
            .eq('user_id', user.id)
            .eq(topicId ? 'topic_id' : 'reply_id', topicId || replyId)
            .maybeSingle();

          if (existing) {
              if (existing.reaction_type === reactionType) {
                  // Remove reaction if clicking the same type
                  await supabase
                    .from('club_forum_reactions')
                    .delete()
                    .eq('id', existing.id);
              } else {
                  // Update reaction type
                  await supabase
                    .from('club_forum_reactions')
                    .update({ reaction_type: reactionType })
                    .eq('id', existing.id);
              }
          } else {
              // Create new reaction
              await supabase
                .from('club_forum_reactions')
                .insert({
                    user_id: user.id,
                    topic_id: topicId,
                    reply_id: replyId,
                    reaction_type: reactionType
                });
          }

          // Refresh data
          if (selectedTopic) {
              fetchReplies(selectedTopic.id);
          }
          fetchTopics();
      } catch (error: any) {
          console.error('Error toggling reaction:', error);
      }
  };

  const viewTopic = (topic: ForumTopic) => {
      setSelectedTopic(topic);
      fetchReplies(topic.id);
  };

  const backToTopics = () => {
      setSelectedTopic(null);
      setReplies([]);
      setNewReply('');
      setReplyingToReplyId(null);
      setEditingTopic(null);
      setEditingReply(null);
  };

  const handleAcceptInvite = async () => {
      const { error } = await supabase
        .from('club_members')
        .update({ status: 'accepted' })
        .eq('club_id', id)
        .eq('user_id', user!.id);
      
      if (error) Alert.alert('Error', error.message);
      else {
          setMemberStatus('accepted');
          fetchMembership(); // Refresh to load chat
      }
  };

  const fetchConnections = async () => {
      if (!user) return;
      
      const { data, error } = await supabase.rpc('get_user_connections_list', {
          target_user_id: user.id,
          filter_intent: null // Get all connections regardless of intent
      });
      
      if (error) {
          console.error('Error fetching connections:', error);
          Alert.alert('Error', 'Failed to load connections');
          return;
      }
      
      // Filter out existing members
      const memberIds = new Set(members.map(m => m.user_id));
      const filtered = (data || []).filter((u: any) => !memberIds.has(u.id));
      setSearchResults(filtered);
  };

  const inviteUser = async (userId: string) => {
      const { error } = await supabase
        .from('club_members')
        .insert({
            club_id: id,
            user_id: userId,
            role: 'member',
            status: 'invited'
        });
      
      if (error) Alert.alert('Error', error.message);
      else {
          Alert.alert('Invited!', 'User has been invited.');
          setInviteModalVisible(false);
      }
  };

  const fetchEvents = async () => {
      try {
          const { data: eventsData, error } = await supabase
            .from('club_events')
            .select('*')
            .eq('club_id', id)
            .order('event_date', { ascending: true });
          
          if (error) throw error;
          
          if (eventsData) {
              // Fetch creators manually to avoid Foreign Key issues
              const userIds = [...new Set(eventsData.map(e => e.created_by))];
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', userIds);
                
              const profilesMap = new Map(profiles?.map(p => [p.id, p]));
              
              // Fetch RSVP counts and user's RSVP for each event
              const eventIds = eventsData.map(e => e.id);
              const { data: rsvps } = await supabase
                .from('club_event_rsvps')
                .select('event_id, user_id, status')
                .in('event_id', eventIds);
              
              // Calculate RSVP counts and user's RSVP
              const rsvpMap = new Map<string, { going: number; maybe: number; cant: number; userRsvp: 'going' | 'maybe' | 'cant' | null }>();
              
              eventIds.forEach(eventId => {
                  const eventRsvps = rsvps?.filter(r => r.event_id === eventId) || [];
                  const going = eventRsvps.filter(r => r.status === 'going').length;
                  const maybe = eventRsvps.filter(r => r.status === 'maybe').length;
                  const cant = eventRsvps.filter(r => r.status === 'cant').length;
                  const userRsvp = eventRsvps.find(r => r.user_id === user?.id)?.status as 'going' | 'maybe' | 'cant' | null || null;
                  
                  rsvpMap.set(eventId, { going, maybe, cant, userRsvp });
              });
              
              const formattedEvents = eventsData.map(event => {
                  const rsvpData = rsvpMap.get(event.id) || { going: 0, maybe: 0, cant: 0, userRsvp: null };
                  return {
                      ...event,
                      creator: profilesMap.get(event.created_by) || { username: 'Unknown', full_name: null, avatar_url: null },
                      rsvp_counts: {
                          going: rsvpData.going,
                          maybe: rsvpData.maybe,
                          cant: rsvpData.cant
                      },
                      user_rsvp: rsvpData.userRsvp
                  };
              });
              
              setEvents(formattedEvents);
              
              // Schedule notifications for upcoming events the user hasn't been notified about
              formattedEvents.forEach((event: ClubEvent) => {
                  const eventDate = new Date(event.event_date);
                  if (eventDate > new Date()) {
                      scheduleEventNotificationForUser(event);
                  }
              });
          }
      } catch (error) {
          console.error('Error fetching events:', error);
      }
  };

  const scheduleEventNotificationForUser = async (event: ClubEvent) => {
      try {
          // Request notification permissions
          const { status } = await Notifications.getPermissionsAsync();
          if (status !== 'granted') {
              return;
          }

          const eventDate = new Date(event.event_date);
          const notificationTime = new Date(eventDate.getTime() - 60 * 60 * 1000); // 1 hour before
          
          // Only schedule if the notification time is in the future
          if (notificationTime <= new Date()) {
              return;
          }

          // Check if notification already scheduled (by checking existing notifications)
          // For simplicity, we'll schedule it - duplicate notifications will be handled by the OS
          await Notifications.scheduleNotificationAsync({
              content: {
                  title: `Upcoming Event: ${event.title}`,
                  body: `Starts in 1 hour${event.location ? ` at ${event.location}` : ''}`,
                  data: { eventId: event.id, clubId: id, type: 'club_event' },
              },
              trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: notificationTime,
              },
          });
      } catch (error) {
          // Silently fail - notifications are optional
          console.log('Could not schedule notification:', error);
      }
  };

  const createEvent = async () => {
      if (!newEventTitle.trim() || !newEventDate) {
          Alert.alert('Error', 'Title and date are required');
          return;
      }

      setCreatingEvent(true);
      try {
          // Format date as ISO string for database
          const eventDateISO = newEventDate.toISOString();
          
          const { data: newEvent, error } = await supabase
            .from('club_events')
            .insert({
                club_id: id,
                created_by: user!.id,
                title: newEventTitle.trim(),
                description: newEventDesc.trim() || null,
                event_date: eventDateISO,
                location: newEventLocation.trim() || null
            })
            .select()
            .single();

          if (error) throw error;

          // Schedule notifications for all club members
          if (newEvent) {
              await scheduleEventNotifications(newEvent);
          }

          setEventModalVisible(false);
          setNewEventTitle('');
          setNewEventDesc('');
          setNewEventDate(new Date());
          setNewEventLocation('');
          fetchEvents();
          Alert.alert('Success', 'Event created! Members will be notified 1 hour before the event.');
      } catch (error: any) {
          Alert.alert('Error', error.message);
      } finally {
          setCreatingEvent(false);
      }
  };

  const openEditEvent = (event: ClubEvent) => {
      setEditingEvent(event);
      setEditEventTitle(event.title);
      setEditEventDesc(event.description || '');
      setEditEventDate(new Date(event.event_date));
      setEditEventLocation(event.location || '');
      setEditEventModalVisible(true);
      setEventMenuVisible(false);
      setSelectedEventId(null);
  };

  const updateEvent = async () => {
      if (!editingEvent || !editEventTitle.trim()) {
          Alert.alert('Error', 'Event title is required');
          return;
      }

      setUpdatingEvent(true);
      try {
          const eventDateISO = editEventDate.toISOString();
          
          const { error } = await supabase
            .from('club_events')
            .update({
                title: editEventTitle.trim(),
                description: editEventDesc.trim() || null,
                event_date: eventDateISO,
                location: editEventLocation.trim() || null
            })
            .eq('id', editingEvent.id)
            .eq('club_id', id);

          if (error) throw error;

          setEditEventModalVisible(false);
          setEditingEvent(null);
          setEditEventTitle('');
          setEditEventDesc('');
          setEditEventDate(new Date());
          setEditEventLocation('');
          await fetchEvents();
          Alert.alert('Success', 'Event updated successfully');
      } catch (error: any) {
          Alert.alert('Error', error.message || 'Failed to update event');
      } finally {
          setUpdatingEvent(false);
      }
  };

  const updateRSVP = async (eventId: string, status: 'going' | 'maybe' | 'cant') => {
      if (!user) return;

      // Optimistically update the UI immediately
      setEvents(prevEvents => {
          return prevEvents.map(event => {
              if (event.id === eventId) {
                  const oldStatus = event.user_rsvp;
                  const counts = event.rsvp_counts || { going: 0, maybe: 0, cant: 0 };
                  
                  // Decrement old status count if it exists
                  if (oldStatus === 'going') counts.going = Math.max(0, counts.going - 1);
                  if (oldStatus === 'maybe') counts.maybe = Math.max(0, counts.maybe - 1);
                  if (oldStatus === 'cant') counts.cant = Math.max(0, counts.cant - 1);
                  
                  // Increment new status count
                  if (status === 'going') counts.going += 1;
                  if (status === 'maybe') counts.maybe += 1;
                  if (status === 'cant') counts.cant += 1;
                  
                  return {
                      ...event,
                      user_rsvp: status,
                      rsvp_counts: counts
                  };
              }
              return event;
          });
      });

      try {
          // Use upsert to insert or update RSVP
          const { error } = await supabase
              .from('club_event_rsvps')
              .upsert({
                  event_id: eventId,
                  user_id: user.id,
                  status: status
              }, {
                  onConflict: 'event_id,user_id'
              });

          if (error) throw error;

          // Refresh events to get accurate counts from server
          await fetchEvents();
      } catch (error: any) {
          // Revert optimistic update on error
          await fetchEvents();
          Alert.alert('Error', error.message || 'Failed to update RSVP');
      }
  };

  const deleteEvent = async (eventId: string) => {
      Alert.alert(
          'Delete Event',
          'Are you sure you want to delete this event? This action cannot be undone.',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          const { error } = await supabase
                              .from('club_events')
                              .delete()
                              .eq('id', eventId)
                              .eq('club_id', id);

                          if (error) throw error;

                          // Refresh events list
                          await fetchEvents();
                          setEventMenuVisible(false);
                          setSelectedEventId(null);
                          Alert.alert('Success', 'Event deleted successfully');
                      } catch (error: any) {
                          Alert.alert('Error', error.message || 'Failed to delete event');
                      }
                  }
              }
          ]
      );
  };

  const scheduleEventNotifications = async (event: ClubEvent) => {
      try {
          // Request notification permissions
          const { status } = await Notifications.requestPermissionsAsync();
          if (status !== 'granted') {
              console.log('Notification permissions not granted');
              return;
          }

          // Get all club members
          const { data: members } = await supabase
            .from('club_members')
            .select('user_id')
            .eq('club_id', id)
            .eq('status', 'accepted');

          if (!members || members.length === 0) return;

          const eventDate = new Date(event.event_date);
          const notificationTime = new Date(eventDate.getTime() - 60 * 60 * 1000); // 1 hour before
          
          // Only schedule if the notification time is in the future
          if (notificationTime <= new Date()) {
              return;
          }

          // Schedule notification for current user (creator)
          await Notifications.scheduleNotificationAsync({
              content: {
                  title: `Upcoming Event: ${event.title}`,
                  body: `Starts in 1 hour${event.location ? ` at ${event.location}` : ''}`,
                  data: { eventId: event.id, clubId: id, type: 'club_event' },
              },
              trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: notificationTime,
              },
          });

          // Note: For other members, we'd need to send push notifications via Supabase Edge Function
          // Local notifications only work for the current device
          // The push notification system will handle notifying other members
      } catch (error) {
          console.error('Error scheduling notifications:', error);
      }
  };

  const addToCalendar = async (event: ClubEvent) => {
      try {
          // Request calendar permissions
          const { status } = await Calendar.requestCalendarPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Required', 'Please enable calendar access in settings to add events.');
              return;
          }

          // Get default calendar
          const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
          const defaultCalendar = calendars.find(cal => cal.allowsModifications) || calendars[0];

          if (!defaultCalendar) {
              Alert.alert('Error', 'No calendar available');
              return;
          }

          const eventDate = new Date(event.event_date);
          const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000); // 1 hour duration

          await Calendar.createEventAsync(defaultCalendar.id, {
              title: event.title,
              startDate: eventDate,
              endDate: endDate,
              notes: event.description || undefined,
              location: event.location || undefined,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });

          Alert.alert('Success', 'Event added to your calendar!');
      } catch (error: any) {
          console.error('Error adding to calendar:', error);
          Alert.alert('Error', error.message || 'Failed to add event to calendar');
      }
  };

  if (loading) return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator /></View>;
  if (!club) return <View className="flex-1 bg-white items-center justify-center"><Text>Club not found</Text></View>;

  const isMember = memberStatus === 'accepted';
  const isAdmin = role === 'admin' || role === 'owner';

  return (
    <>
      <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          className="flex-1 bg-gray-50"
      >
        {/* Custom Header */}
        <View className="bg-white border-b border-gray-200 px-4 pb-4 flex-row items-center" style={{ paddingTop: insets.top + 12 }}>
            <TouchableOpacity onPress={() => router.back()} className="mr-4">
                <IconSymbol name="chevron.left" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-ink flex-1">{club.name}</Text>
            {role === 'owner' && (
                <TouchableOpacity 
                    onPress={() => setActiveTab('settings')}
                    className="ml-4"
                >
                    <IconSymbol name="gearshape.fill" size={24} color="#1A1A1A" />
                </TouchableOpacity>
            )}
        </View>

        {/* Club Image Banner */}
        <View className="h-48 bg-gray-900 relative">
            <ClubImage path={club.image_url} />
            <View className="absolute inset-0 bg-black/40" />
            <View className="absolute bottom-4 left-4 right-4">
                <View className="flex-row items-center">
                    <IconSymbol name="location.fill" size={14} color="#E5E7EB" />
                    <Text className="text-gray-200 ml-1 font-semibold">{club.city}</Text>
                </View>
            </View>
        </View>

        {/* Access Control View */}
        {!isMember ? (
            <View className="flex-1 p-6 items-center">
                <Text className="text-gray-600 text-center mb-6 text-lg">{club.description || 'No description provided.'}</Text>
                
                <IconSymbol name="lock.fill" size={64} color="#CBD5E0" />
                <Text className="text-xl font-bold mt-4 mb-2 text-ink">Private Club</Text>
                <Text className="text-gray-500 text-center mb-8">This club is invite only. You must be invited by an admin to join.</Text>

                {memberStatus === 'invited' && (
                    <TouchableOpacity 
                        onPress={handleAcceptInvite}
                        className="bg-black py-4 px-8 rounded-xl shadow-lg w-full items-center"
                    >
                        <Text className="text-white font-bold text-lg">Accept Invite</Text>
                    </TouchableOpacity>
                )}
            </View>
        ) : (
            <>
                {/* Tabs */}
                <View className="flex-row bg-white border-b border-gray-200">
                    <TouchableOpacity 
                        onPress={() => {
                            setActiveTab('forum');
                            backToTopics();
                        }}
                        className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'forum' ? 'border-black' : 'border-transparent'}`}
                    >
                        <Text className={`font-bold ${activeTab === 'forum' ? 'text-black' : 'text-gray-400'}`}>Forum</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setActiveTab('events')}
                        className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'events' ? 'border-black' : 'border-transparent'}`}
                    >
                        <Text className={`font-bold ${activeTab === 'events' ? 'text-black' : 'text-gray-400'}`}>Events</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setActiveTab('members')}
                        className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'members' ? 'border-black' : 'border-transparent'}`}
                    >
                        <Text className={`font-bold ${activeTab === 'members' ? 'text-black' : 'text-gray-400'}`}>Members</Text>
                    </TouchableOpacity>
                </View>

                {activeTab === 'forum' ? (
                    selectedTopic ? (
                        // Topic Detail View
                        <>
                            <View className="p-4 bg-white border-b border-gray-200 flex-row items-center">
                                <TouchableOpacity onPress={backToTopics} className="mr-4">
                                    <IconSymbol name="chevron.left" size={24} color="#1A1A1A" />
                                </TouchableOpacity>
                                <Text className="text-lg font-bold text-ink flex-1" numberOfLines={1}>{selectedTopic.title}</Text>
                            </View>
                            <ScrollView 
                                className="flex-1 px-4" 
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={{ paddingBottom: 20 }}
                                showsVerticalScrollIndicator={true}
                                keyboardDismissMode="interactive"
                            >
                                {/* Topic Header */}
                                <View className="py-4 border-b border-gray-200">
                                    <View className="flex-row items-center justify-between mb-2">
                                        <View className="flex-row items-center">
                                            {selectedTopic.is_pinned && (
                                                <IconSymbol name="pin.fill" size={16} color="#2563EB" style={{ marginRight: 4 }} />
                                            )}
                                            {selectedTopic.is_locked && (
                                                <IconSymbol name="lock.fill" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                                            )}
                                        </View>
                                        {selectedTopic.created_by === user?.id && (
                                            <TouchableOpacity 
                                                onPress={() => {
                                                    setEditingTopic(selectedTopic);
                                                    setEditTopicTitle(selectedTopic.title);
                                                    setEditTopicContent(selectedTopic.content);
                                                }}
                                                className="px-3 py-1 bg-gray-100 rounded-full"
                                            >
                                                <Text className="text-xs text-gray-600">Edit</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <View className="flex-row items-center mb-3">
                                        <TouchableOpacity 
                                            onPress={() => viewUserProfile(selectedTopic.created_by)}
                                            className="mr-2"
                                        >
                                            <Avatar url={selectedTopic.creator.avatar_url} size={32} onUpload={() => {}} editable={false} />
                                        </TouchableOpacity>
                                        <View className="flex-1">
                                            <TouchableOpacity onPress={() => viewUserProfile(selectedTopic.created_by)}>
                                                <Text className="text-sm font-semibold text-ink">
                                                    {selectedTopic.creator.full_name || selectedTopic.creator.username}
                                                </Text>
                                            </TouchableOpacity>
                                            <Text className="text-xs text-gray-500">
                                                {new Date(selectedTopic.created_at).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit'
                                                })}
                                                {selectedTopic.is_edited && (
                                                    <Text className="text-gray-400 italic"> • edited</Text>
                                                )}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text className="text-ink leading-6 mb-3">{selectedTopic.content}</Text>
                                    
                                    {/* Support/Oppose Buttons */}
                                    <View className="flex-row items-center gap-4 mt-2">
                                        <TouchableOpacity 
                                            onPress={() => toggleReaction(selectedTopic.id, null, 'support')}
                                            className={`flex-row items-center px-3 py-1.5 rounded-full ${
                                                selectedTopic.user_reaction === 'support' ? 'bg-green-100' : 'bg-gray-100'
                                            }`}
                                        >
                                            <IconSymbol name="hand.thumbsup.fill" size={16} color={selectedTopic.user_reaction === 'support' ? '#10B981' : '#6B7280'} />
                                            <Text className={`text-xs ml-1 ${selectedTopic.user_reaction === 'support' ? 'text-green-600 font-semibold' : 'text-gray-600'}`}>
                                                {selectedTopic.support_count || 0}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            onPress={() => toggleReaction(selectedTopic.id, null, 'oppose')}
                                            className={`flex-row items-center px-3 py-1.5 rounded-full ${
                                                selectedTopic.user_reaction === 'oppose' ? 'bg-red-100' : 'bg-gray-100'
                                            }`}
                                        >
                                            <IconSymbol name="hand.thumbsdown.fill" size={16} color={selectedTopic.user_reaction === 'oppose' ? '#EF4444' : '#6B7280'} />
                                            <Text className={`text-xs ml-1 ${selectedTopic.user_reaction === 'oppose' ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                                {selectedTopic.oppose_count || 0}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Replies */}
                                <View className="py-4">
                                    <Text className="font-bold text-lg text-ink mb-3">
                                        {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                                    </Text>
                                    {replies.map((reply) => (
                                        <ReplyItem
                                            key={reply.id}
                                            reply={reply}
                                            user={user}
                                            onReply={(replyId) => {
                                                setReplyingToReplyId(replyId);
                                                setEditReplyContent('');
                                            }}
                                            onEdit={(reply) => {
                                                setEditingReply(reply);
                                                setEditReplyContent(reply.content);
                                            }}
                                            onDelete={deleteReply}
                                            onToggleReaction={(replyId, type) => toggleReaction(null, replyId, type)}
                                            onViewProfile={viewUserProfile}
                                            depth={0}
                                        />
                                    ))}
                                </View>
                            </ScrollView>
                            {!selectedTopic.is_locked && (
                                <View className="bg-white border-t border-gray-100" style={{ paddingBottom: insets.bottom }}>
                                    {replyingToReplyId && (
                                        <View className="px-4 pt-3 pb-2 bg-blue-50 flex-row items-center justify-between">
                                            <Text className="text-xs text-blue-700 font-medium">Replying to a comment</Text>
                                            <TouchableOpacity 
                                                onPress={() => {
                                                    setReplyingToReplyId(null);
                                                    setEditReplyContent('');
                                                    Keyboard.dismiss();
                                                }}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                <IconSymbol name="xmark" size={16} color="#2563EB" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <View className="px-4 py-3">
                                        <View className="flex-row items-end bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200">
                                            <TextInput
                                                value={replyingToReplyId ? editReplyContent : newReply}
                                                onChangeText={replyingToReplyId ? setEditReplyContent : setNewReply}
                                                placeholder="Write a reply..."
                                                placeholderTextColor="#9CA3AF"
                                                className="flex-1 text-ink"
                                                style={{ 
                                                    maxHeight: 120, 
                                                    minHeight: 40,
                                                    fontSize: 16,
                                                    lineHeight: 22,
                                                    color: '#1A1A1A'
                                                }}
                                                multiline
                                                returnKeyType="send"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => {
                                                    const content = replyingToReplyId ? editReplyContent : newReply;
                                                    if (content.trim() && !replying) {
                                                        createReply(replyingToReplyId || null);
                                                    }
                                                }}
                                                textAlignVertical="top"
                                                editable={!replying}
                                            />
                                            <TouchableOpacity 
                                                onPress={() => {
                                                    if (!replying) {
                                                        createReply(replyingToReplyId || null);
                                                    }
                                                }} 
                                                disabled={(replyingToReplyId ? !editReplyContent.trim() : !newReply.trim()) || replying}
                                                className="ml-3 p-2"
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                {replying ? (
                                                    <ActivityIndicator size="small" color="#2563EB" />
                                                ) : (
                                                    <IconSymbol 
                                                        name="paperplane.fill" 
                                                        size={22} 
                                                        color={(replyingToReplyId ? editReplyContent.trim() : newReply.trim()) ? '#2563EB' : '#9CA3AF'} 
                                                    />
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </>
                    ) : (
                        // Topics List View
                        <>
                            <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                                <Text className="font-bold text-gray-500">{topics.length} {topics.length === 1 ? 'Topic' : 'Topics'}</Text>
                                <TouchableOpacity 
                                    onPress={() => setTopicModalVisible(true)}
                                    className="bg-black px-4 py-2 rounded-full"
                                >
                                    <Text className="text-white text-xs font-bold">New Topic</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={topics}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity 
                                        onPress={() => viewTopic(item)}
                                        className="p-4 bg-white border-b border-gray-50 active:bg-gray-50"
                                    >
                                        <View className="flex-row items-start mb-2">
                                            {item.is_pinned && (
                                                <IconSymbol name="pin.fill" size={14} color="#2563EB" style={{ marginRight: 4, marginTop: 2 }} />
                                            )}
                                            {item.is_locked && (
                                                <IconSymbol name="lock.fill" size={14} color="#EF4444" style={{ marginRight: 4, marginTop: 2 }} />
                                            )}
                                            <Text className="font-bold text-ink flex-1" numberOfLines={2}>{item.title}</Text>
                                        </View>
                                        <View className="flex-row items-center justify-between mt-2">
                                            <TouchableOpacity 
                                                onPress={() => viewUserProfile(item.created_by)}
                                                className="flex-row items-center"
                                            >
                                                <View className="mr-2">
                                                    <Avatar url={item.creator.avatar_url} size={24} onUpload={() => {}} editable={false} />
                                                </View>
                                                <Text className="text-xs text-gray-500">
                                                    {item.creator.full_name || item.creator.username}
                                                </Text>
                                            </TouchableOpacity>
                                            <View className="flex-row items-center">
                                                <IconSymbol name="bubble.left.and.bubble.right" size={14} color="#6B7280" />
                                                <Text className="text-xs text-gray-500 ml-1">{item.reply_count}</Text>
                                                {item.last_reply_at && (
                                                    <Text className="text-xs text-gray-400 ml-3">
                                                        {new Date(item.last_reply_at).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    <View className="p-8 items-center">
                                        <Text className="text-gray-400 text-center">No topics yet. Start a discussion!</Text>
                                    </View>
                                }
                            />
                        </>
                    )
                ) : activeTab === 'events' ? (
                    <View className="flex-1">
                        <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                            <Text className="font-bold text-gray-500">{events.length} Events</Text>
                            {isAdmin && (
                                <TouchableOpacity 
                                    onPress={() => setEventModalVisible(true)}
                                    className="bg-black px-4 py-2 rounded-full"
                                >
                                    <Text className="text-white text-xs font-bold">Create Event</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <FlatList
                            data={events}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => (
                                <EventCard
                                    event={item}
                                    isAdmin={isAdmin}
                                    currentUserId={user?.id}
                                    onEdit={openEditEvent}
                                    onDelete={deleteEvent}
                                    onRSVP={updateRSVP}
                                    onAddToCalendar={addToCalendar}
                                    onViewProfile={viewUserProfile}
                                />
                            )}
                            ListEmptyComponent={
                                <View className="items-center mt-20 opacity-50">
                                    <IconSymbol name="calendar" size={48} color="#CBD5E0" />
                                    <Text className="text-gray-500 mt-4 font-medium">No events scheduled</Text>
                                </View>
                            }
                        />
                    </View>
                ) : activeTab === 'members' ? (
                    <View className="flex-1">
                        <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                            <Text className="font-bold text-gray-500">{members.length} Members</Text>
                            {isAdmin && (
                                <TouchableOpacity 
                                    onPress={() => setInviteModalVisible(true)}
                                    className="bg-black px-4 py-2 rounded-full"
                                >
                                    <Text className="text-white text-xs font-bold">Invite Member</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <FlatList
                            data={members}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => (
                                <View className="flex-row items-center p-4 bg-white border-b border-gray-50">
                                    <View className="mr-3">
                                        <Avatar url={item.profile.avatar_url} size={40} onUpload={() => {}} editable={false} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-ink">{item.profile.full_name || item.profile.username}</Text>
                                        <Text className="text-gray-500 text-xs">@{item.profile.username}</Text>
                                    </View>
                                    <View className={`px-2 py-1 rounded text-xs ${
                                        item.role === 'owner' ? 'bg-purple-100' : item.role === 'admin' ? 'bg-blue-100' : 'bg-gray-100'
                                    }`}>
                                        <Text className={`text-[10px] font-bold uppercase ${
                                            item.role === 'owner' ? 'text-purple-700' : item.role === 'admin' ? 'text-blue-700' : 'text-gray-500'
                                        }`}>{item.role}</Text>
                                    </View>
                                </View>
                            )}
                        />
                    </View>
                ) : activeTab === 'settings' ? (
                    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
                        <View className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
                            <Text className="text-2xl font-bold text-ink mb-6">Club Settings</Text>
                            
                            {/* Club Name */}
                            <View className="mb-4">
                                <Text className="font-bold text-gray-500 mb-2">Club Name *</Text>
                                <TextInput
                                    value={settingsName}
                                    onChangeText={setSettingsName}
                                    placeholder="Enter club name"
                                    className="bg-gray-100 p-4 rounded-xl text-lg"
                                    returnKeyType="next"
                                    blurOnSubmit={false}
                                    onSubmitEditing={() => Keyboard.dismiss()}
                                />
                            </View>

                            {/* Description */}
                            <View className="mb-4">
                                <Text className="font-bold text-gray-500 mb-2">Description</Text>
                                <TextInput
                                    value={settingsDescription}
                                    onChangeText={setSettingsDescription}
                                    placeholder="What's this club about?"
                                    multiline
                                    numberOfLines={4}
                                    className="bg-gray-100 p-4 rounded-xl text-base h-32"
                                    style={{ textAlignVertical: 'top' }}
                                    returnKeyType="done"
                                    blurOnSubmit={true}
                                    onSubmitEditing={() => Keyboard.dismiss()}
                                />
                            </View>

                            {/* Max Member Count */}
                            <View className="mb-6">
                                <Text className="font-bold text-gray-500 mb-2">Maximum Members</Text>
                                <TextInput
                                    value={settingsMaxMembers}
                                    onChangeText={setSettingsMaxMembers}
                                    placeholder="Leave empty for unlimited"
                                    keyboardType="numeric"
                                    className="bg-gray-100 p-4 rounded-xl text-lg"
                                    returnKeyType="done"
                                    blurOnSubmit={true}
                                    onSubmitEditing={() => Keyboard.dismiss()}
                                />
                                <Text className="text-xs text-gray-400 mt-2">
                                    Current members: {members.filter(m => m.status === 'accepted').length}
                                    {club?.max_member_count && ` / ${club.max_member_count}`}
                                </Text>
                                <Text className="text-xs text-gray-400 mt-1">
                                    Leave empty to allow unlimited members
                                </Text>
                            </View>

                            {/* Save Button */}
                            <TouchableOpacity
                                onPress={updateClubSettings}
                                disabled={savingSettings || !settingsName.trim()}
                                className={`py-4 rounded-xl items-center ${savingSettings || !settingsName.trim() ? 'bg-gray-300' : 'bg-black'}`}
                            >
                                {savingSettings ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-bold text-lg">Save Changes</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Danger Zone */}
                        {role === 'owner' && (
                            <View className="bg-white rounded-2xl p-6 shadow-sm">
                                <Text className="text-xl font-bold text-red-600 mb-4">Danger Zone</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        Alert.alert(
                                            'Delete Club',
                                            'Are you sure you want to delete this club? This action cannot be undone. All members, events, and forum posts will be permanently deleted.',
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                {
                                                    text: 'Delete',
                                                    style: 'destructive',
                                                    onPress: async () => {
                                                        try {
                                                            const { error } = await supabase
                                                                .from('clubs')
                                                                .delete()
                                                                .eq('id', id);
                                                            if (error) throw error;
                                                            Alert.alert('Success', 'Club deleted');
                                                            router.back();
                                                        } catch (error: any) {
                                                            Alert.alert('Error', error.message);
                                                        }
                                                    }
                                                }
                                            ]
                                        );
                                    }}
                                    className="bg-red-50 border border-red-200 py-4 rounded-xl items-center"
                                >
                                    <Text className="text-red-600 font-bold">Delete Club</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                ) : null}
            </>
        )}

        {/* Invite Modal */}
        <Modal
            visible={inviteModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setInviteModalVisible(false)}
            onShow={fetchConnections}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Invite Members</Text>
                    <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
                        <Text className="text-gray-500">Close</Text>
                    </TouchableOpacity>
                </View>

                <Text className="text-gray-600 mb-4">Select from your connections:</Text>

                <FlatList
                    data={searchResults}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
                            <View className="flex-row items-center">
                                <View className="w-8 h-8 mr-2 rounded-full overflow-hidden">
                                    <Avatar path={item.avatar_url} />
                                </View>
                                <Text className="font-bold">{item.username}</Text>
                            </View>
                            <TouchableOpacity 
                                onPress={() => inviteUser(item.id)}
                                className="bg-black px-3 py-1.5 rounded-lg"
                            >
                                <Text className="text-white text-xs font-bold">Invite</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            </View>
        </Modal>

        {/* Create Topic Modal */}
        <Modal
            visible={topicModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setTopicModalVisible(false)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Create Topic</Text>
                    <TouchableOpacity onPress={() => setTopicModalVisible(false)}>
                        <Text className="text-gray-500">Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView>
                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Topic Title *</Text>
                        <TextInput
                            value={newTopicTitle}
                            onChangeText={setNewTopicTitle}
                            placeholder="e.g. Weekly Discussion"
                            className="bg-gray-100 p-4 rounded-xl"
                            returnKeyType="next"
                            blurOnSubmit={false}
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Content *</Text>
                        <TextInput
                            value={newTopicContent}
                            onChangeText={setNewTopicContent}
                            placeholder="What would you like to discuss?"
                            multiline
                            numberOfLines={6}
                            className="bg-gray-100 p-4 rounded-xl h-32"
                            style={{ textAlignVertical: 'top' }}
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />
                    </View>

                    <TouchableOpacity 
                        onPress={createTopic}
                        disabled={!newTopicTitle.trim() || !newTopicContent.trim() || creatingTopic}
                        className={`py-4 rounded-xl items-center ${creatingTopic || !newTopicTitle.trim() || !newTopicContent.trim() ? 'bg-gray-300' : 'bg-black'}`}
                    >
                        {creatingTopic ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold">Create Topic</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>

        {/* Edit Topic Modal */}
        <Modal
            visible={editingTopic !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setEditingTopic(null)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Edit Topic</Text>
                    <TouchableOpacity onPress={() => setEditingTopic(null)}>
                        <Text className="text-gray-500">Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView>
                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Topic Title *</Text>
                        <TextInput
                            value={editTopicTitle}
                            onChangeText={setEditTopicTitle}
                            placeholder="e.g. Weekly Discussion"
                            className="bg-gray-100 p-4 rounded-xl"
                            returnKeyType="next"
                            blurOnSubmit={false}
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Content *</Text>
                        <TextInput
                            value={editTopicContent}
                            onChangeText={setEditTopicContent}
                            placeholder="What would you like to discuss?"
                            multiline
                            numberOfLines={6}
                            className="bg-gray-100 p-4 rounded-xl h-32"
                            style={{ textAlignVertical: 'top' }}
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />
                    </View>

                    <TouchableOpacity 
                        onPress={editTopic}
                        disabled={!editTopicTitle.trim() || !editTopicContent.trim()}
                        className={`py-4 rounded-xl items-center ${!editTopicTitle.trim() || !editTopicContent.trim() ? 'bg-gray-300' : 'bg-black'}`}
                    >
                        <Text className="text-white font-bold">Save Changes</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>

        {/* Edit Reply Modal */}
        <Modal
            visible={editingReply !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setEditingReply(null)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Edit Reply</Text>
                    <TouchableOpacity onPress={() => setEditingReply(null)}>
                        <Text className="text-gray-500">Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView>
                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Reply Content *</Text>
                        <TextInput
                            value={editReplyContent}
                            onChangeText={setEditReplyContent}
                            placeholder="Your reply..."
                            multiline
                            numberOfLines={6}
                            className="bg-gray-100 p-4 rounded-xl h-32"
                            style={{ textAlignVertical: 'top' }}
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />
                    </View>

                    <TouchableOpacity 
                        onPress={editReply}
                        disabled={!editReplyContent.trim()}
                        className={`py-4 rounded-xl items-center ${!editReplyContent.trim() ? 'bg-gray-300' : 'bg-black'}`}
                    >
                        <Text className="text-white font-bold">Save Changes</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>

        {/* Create Event Modal */}
        <Modal
            visible={eventModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setEventModalVisible(false)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Create Event</Text>
                    <TouchableOpacity onPress={() => setEventModalVisible(false)}>
                        <Text className="text-gray-500">Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView>
                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Event Title *</Text>
                        <TextInput
                            value={newEventTitle}
                            onChangeText={setNewEventTitle}
                            placeholder="e.g. Weekly Meetup"
                            className="bg-gray-100 p-4 rounded-xl"
                            returnKeyType="next"
                            blurOnSubmit={false}
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Description</Text>
                        <TextInput
                            value={newEventDesc}
                            onChangeText={setNewEventDesc}
                            placeholder="What's this event about?"
                            multiline
                            numberOfLines={4}
                            className="bg-gray-100 p-4 rounded-xl h-32"
                            style={{ textAlignVertical: 'top' }}
                            returnKeyType="next"
                            blurOnSubmit={false}
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="font-bold text-gray-500 mb-2">Date & Time *</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => setShowDatePicker(true)}
                                activeOpacity={0.7}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#F3F4F6',
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: '#E5E7EB',
                                    minHeight: 70,
                                    justifyContent: 'center'
                                }}
                            >
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date</Text>
                                <Text style={{ fontSize: 16, color: '#1A1A1A', fontWeight: 'bold' }}>
                                    {newEventDate.toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setShowTimePicker(true)}
                                activeOpacity={0.7}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#F3F4F6',
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: '#E5E7EB',
                                    minHeight: 70,
                                    justifyContent: 'center'
                                }}
                            >
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Time</Text>
                                <Text style={{ fontSize: 16, color: '#1A1A1A', fontWeight: 'bold' }}>
                                    {newEventDate.toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                    })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    
                    {/* Android Date Picker - Shows as native modal */}
                    {Platform.OS === 'android' && showDatePicker && (
                        <DateTimePicker
                            value={newEventDate}
                            mode="date"
                            display="default"
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false);
                                if (event.type === 'set' && selectedDate) {
                                    // Preserve the time when changing date
                                    const updatedDate = new Date(selectedDate);
                                    updatedDate.setHours(newEventDate.getHours());
                                    updatedDate.setMinutes(newEventDate.getMinutes());
                                    setNewEventDate(updatedDate);
                                }
                            }}
                            minimumDate={new Date()}
                        />
                    )}
                    
                    {/* Android Time Picker - Shows as native modal */}
                    {Platform.OS === 'android' && showTimePicker && (
                        <DateTimePicker
                            value={newEventDate}
                            mode="time"
                            display="default"
                            onChange={(event, selectedTime) => {
                                setShowTimePicker(false);
                                if (event.type === 'set' && selectedTime) {
                                    // Preserve the date when changing time
                                    const updatedDate = new Date(newEventDate);
                                    updatedDate.setHours(selectedTime.getHours());
                                    updatedDate.setMinutes(selectedTime.getMinutes());
                                    setNewEventDate(updatedDate);
                                }
                            }}
                        />
                    )}
                    
                    {/* iOS Date Picker Modal */}
                    {Platform.OS === 'ios' && showDatePicker && (
                        <Modal
                            visible={showDatePicker}
                            transparent
                            animationType="slide"
                            onRequestClose={() => setShowDatePicker(false)}
                        >
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                                <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>Select Date</Text>
                                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                            <Text style={{ fontSize: 16, color: '#2563EB', fontWeight: '600' }}>Done</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <DateTimePicker
                                        value={newEventDate}
                                        mode="date"
                                        display="spinner"
                                        textColor="black"
                                        themeVariant="light"
                                        onChange={(event, selectedDate) => {
                                            if (selectedDate) {
                                                const updatedDate = new Date(selectedDate);
                                                updatedDate.setHours(newEventDate.getHours());
                                                updatedDate.setMinutes(newEventDate.getMinutes());
                                                setNewEventDate(updatedDate);
                                            }
                                        }}
                                        minimumDate={new Date()}
                                        style={{ height: 200, width: '100%', backgroundColor: 'white' }}
                                    />
                                </View>
                            </View>
                        </Modal>
                    )}
                    
                    {/* iOS Time Picker Modal */}
                    {Platform.OS === 'ios' && showTimePicker && (
                        <Modal
                            visible={showTimePicker}
                            transparent
                            animationType="slide"
                            onRequestClose={() => setShowTimePicker(false)}
                        >
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                                <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>Select Time</Text>
                                        <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                                            <Text style={{ fontSize: 16, color: '#2563EB', fontWeight: '600' }}>Done</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <DateTimePicker
                                        value={newEventDate}
                                        mode="time"
                                        display="spinner"
                                        textColor="black"
                                        themeVariant="light"
                                        onChange={(event, selectedTime) => {
                                            if (selectedTime) {
                                                const updatedDate = new Date(newEventDate);
                                                updatedDate.setHours(selectedTime.getHours());
                                                updatedDate.setMinutes(selectedTime.getMinutes());
                                                setNewEventDate(updatedDate);
                                            }
                                        }}
                                        style={{ height: 200, width: '100%', backgroundColor: 'white' }}
                                    />
                                </View>
                            </View>
                        </Modal>
                    )}

                    <View className="mb-6">
                        <Text className="font-bold text-gray-500 mb-2">Location</Text>
                        <TextInput
                            value={newEventLocation}
                            onChangeText={setNewEventLocation}
                            placeholder="e.g. Central Park"
                            className="bg-gray-100 p-4 rounded-xl"
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />
                    </View>

                    <TouchableOpacity 
                        onPress={createEvent}
                        disabled={creatingEvent || !newEventTitle.trim() || !newEventDate}
                        className="bg-black py-4 rounded-xl items-center shadow-lg"
                    >
                        {creatingEvent ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-lg">Create Event</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>
      </KeyboardAvoidingView>
      <KeyboardToolbar />
      
      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        profile={selectedProfile}
        onClose={() => setProfileModalVisible(false)}
      />

      {/* Event Menu Modal */}
      <Modal
        visible={eventMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setEventMenuVisible(false);
          setSelectedEventId(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setEventMenuVisible(false);
          setSelectedEventId(null);
        }}>
          <View className="flex-1 bg-black/50 items-center justify-center">
            <TouchableWithoutFeedback>
              <View className="bg-white rounded-2xl p-4 min-w-[200px] shadow-lg">
                <TouchableOpacity
                  onPress={() => {
                    if (selectedEventId) {
                      deleteEvent(selectedEventId);
                      setEventMenuVisible(false);
                      setSelectedEventId(null);
                    }
                  }}
                  className="flex-row items-center py-3 px-4"
                >
                  <IconSymbol name="trash.fill" size={20} color="#DC2626" />
                  <Text className="text-red-600 font-semibold ml-3">Delete Event</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function ClubImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (data) {
            setUrl(data.publicUrl);
        }
    }, [path]);

    if (!url) return <View className="w-full h-full bg-gray-300" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

