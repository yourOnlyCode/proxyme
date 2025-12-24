export type ClubDetail = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  city: string;
  owner_id: string;
  max_member_count: number | null;
};

export type ClubMember = {
  id: string; // member id
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'accepted' | 'invited' | 'pending';
  profile: {
      username: string;
      full_name: string;
      avatar_url: string | null;
  }
};

export type ForumTopic = {
    id: string;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
    reply_count: number;
    last_reply_at: string | null;
    is_pinned: boolean;
    is_locked: boolean;
    is_edited: boolean;
    edited_at: string | null;
    created_by: string;
    creator: {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
    }
    support_count?: number;
    oppose_count?: number;
    user_reaction?: 'support' | 'oppose' | null;
};

export type ForumReply = {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
    is_edited: boolean;
    edited_at: string | null;
    parent_reply_id: string | null;
    created_by: string;
    creator: {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
    }
    support_count?: number;
    oppose_count?: number;
    user_reaction?: 'support' | 'oppose' | null;
    replies?: ForumReply[]; // Nested replies
};

export type ClubEvent = {
    id: string;
    title: string;
    description: string | null;
    event_date: string;
    location: string | null;
    created_by: string;
    created_at: string;
    creator: {
        username: string;
        full_name: string | null;
    }
    rsvp_counts?: {
        going: number;
        maybe: number;
        cant: number;
    };
    user_rsvp?: 'going' | 'maybe' | 'cant' | null;
};

