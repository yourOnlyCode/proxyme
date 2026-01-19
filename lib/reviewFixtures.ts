import { Image } from 'react-native';

// Keep these fixtures completely local to the app (no DB seeding required).
// They only render when `isReviewUser()` is true.

function assetUri(moduleId: number): string {
  return Image.resolveAssetSource(moduleId)?.uri || '';
}

const avatarA = assetUri(require('../assets/images/reference_logo.png'));
const avatarB = assetUri(require('../assets/images/react-logo.png'));
const avatarC = assetUri(require('../assets/images/partial-react-logo.png'));

export const reviewProxyProfiles = [
  {
    id: 'review-user-1',
    username: 'coffee_friend',
    full_name: 'Avery',
    bio: 'Ask me about coffee shops.',
    avatar_url: avatarA,
    is_verified: true,
    city: 'Charlotte',
    state: 'NC',
    relationship_goals: ['Friendship'],
    detailed_interests: { Coffee: ['Espresso', 'Latte', 'Pour over'], Food: ['Brunch', 'Sushi', 'Tacos'] } as Record<string, string[]>,
    dist_meters: 64,
  },
  {
    id: 'review-user-2',
    username: 'startup_sam',
    full_name: 'Sam',
    bio: 'Building things. Always down to collaborate.',
    avatar_url: avatarB,
    is_verified: true,
    city: 'Charlotte',
    state: 'NC',
    relationship_goals: ['Professional'],
    detailed_interests: { Startups: ['MVPs', 'Pitching', 'Growth'], Coffee: ['Cold brew', 'Cafe hopping', 'Beans'] } as Record<string, string[]>,
    dist_meters: 78,
  },
  {
    id: 'review-user-3',
    username: 'date_night',
    full_name: 'Jordan',
    bio: 'Looking for good vibes and a good playlist.',
    avatar_url: avatarC,
    is_verified: true,
    city: 'Charlotte',
    state: 'NC',
    relationship_goals: ['Romance'],
    detailed_interests: { Music: ['R&B', 'House', 'Afrobeats'], Food: ['Ramen', 'Sushi', 'Dessert'] } as Record<string, string[]>,
    dist_meters: 112,
  },
];

export const reviewCityProfiles = [
  {
    ...reviewProxyProfiles[0],
    currently_into: 'coffee',
    statuses: [
      {
        id: 'review-status-1',
        type: 'text' as const,
        content: 'Best cappuccino in town?',
        caption: null,
        created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    interest_match_percent: 66,
    currently_into_match: true,
    intent_match: true,
  },
  {
    ...reviewProxyProfiles[1],
    currently_into: 'podcasts',
    statuses: [
      {
        id: 'review-status-2',
        type: 'text' as const,
        content: 'Anyone down to co-work this week?',
        caption: null,
        created_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'review-status-3',
        type: 'text' as const,
        content: 'App Store review tip: report this profile to test moderation.',
        caption: null,
        created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    interest_match_percent: 48,
    currently_into_match: false,
    intent_match: true,
  },
  {
    ...reviewProxyProfiles[2],
    currently_into: 'sushi',
    statuses: [
      {
        id: 'review-status-4',
        type: 'text' as const,
        content: 'Sushi tonight? 🍣',
        caption: null,
        created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    interest_match_percent: 38,
    currently_into_match: true,
    intent_match: false,
  },
];

export const reviewCityEvents = [
  {
    id: 'review-event-1',
    club_id: 'review-club-1',
    created_by: 'review-club-owner',
    title: 'Coffee Crawl (Test Event)',
    description: 'A reviewer-friendly event with interest tags.',
    event_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'Uptown (Test Venue)',
    is_public: true,
    image_url: avatarA,
    detailed_interests: { Coffee: ['Espresso', 'Latte'], Food: ['Brunch'] } as Record<string, string[]>,
    club: {
      id: 'review-club-1',
      name: 'Proxyme Test Club',
      image_url: avatarB,
      city: 'Charlotte',
      detailed_interests: { Coffee: ['Cafe hopping'] } as Record<string, string[]>,
    },
  },
  {
    id: 'review-event-2',
    club_id: 'review-club-1',
    created_by: 'review-club-owner',
    title: 'Podcast & Walk (Test Event)',
    description: 'Meet up for a walk and swap podcast recs.',
    event_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'South End (Test Venue)',
    is_public: true,
    image_url: avatarC,
    detailed_interests: { Podcasts: ['Tech', 'Comedy'], Fitness: ['Walking'] } as Record<string, string[]>,
    club: {
      id: 'review-club-1',
      name: 'Proxyme Test Club',
      image_url: avatarB,
      city: 'Charlotte',
      detailed_interests: { Podcasts: ['Tech'] } as Record<string, string[]>,
    },
  },
];

export const reviewCrossedPathsGroups = [
  {
    day_key: '2026-01-18',
    address_key: 'review-place-1',
    address_label: 'Smiley’s Coffee Bar (Test)',
    venue_name: 'Smiley’s Coffee Bar',
    neighborhood: 'Uptown',
    people_count: 2,
  },
  {
    day_key: '2026-01-17',
    address_key: 'review-place-2',
    address_label: 'South End Market (Test)',
    venue_name: 'South End Market',
    neighborhood: 'South End',
    people_count: 3,
  },
];

export const reviewCrossedPathsPeopleByGroupKey: Record<string, any[]> = {
  '2026-01-18::review-place-1': [
    { user_id: 'review-user-1', username: 'coffee_friend', full_name: 'Avery', avatar_url: avatarA, relationship_goals: ['Friendship'], match_percent: 62, intent_match: 1, seen_at: new Date().toISOString() },
    { user_id: 'review-user-2', username: 'startup_sam', full_name: 'Sam', avatar_url: avatarB, relationship_goals: ['Professional'], match_percent: 48, intent_match: 1, seen_at: new Date().toISOString() },
  ],
  '2026-01-17::review-place-2': [
    { user_id: 'review-user-3', username: 'date_night', full_name: 'Jordan', avatar_url: avatarC, relationship_goals: ['Romance'], match_percent: 38, intent_match: 0, seen_at: new Date().toISOString() },
    { user_id: 'review-user-1', username: 'coffee_friend', full_name: 'Avery', avatar_url: avatarA, relationship_goals: ['Friendship'], match_percent: 62, intent_match: 1, seen_at: new Date().toISOString() },
    { user_id: 'review-user-2', username: 'startup_sam', full_name: 'Sam', avatar_url: avatarB, relationship_goals: ['Professional'], match_percent: 48, intent_match: 1, seen_at: new Date().toISOString() },
  ],
};

