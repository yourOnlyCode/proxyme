# Interests Curation & Custom Category Feature

## Changes Made

### 1. ✅ Curated Interests List (44 Categories)

**File**: `constants/interests.ts`

**Before**: 130+ categories (overwhelming, too niche)

**After**: 44 carefully selected, high-engagement categories

#### Categories Removed
Eliminated niche/specialized interests including:
- Craft Beer, Vegetarian/Vegan
- Rock Climbing, Martial Arts, CrossFit, Wellness
- Theater, Museums, Poetry
- Board Games, Karaoke, Anime
- History, Philosophy, Politics, Language Learning
- Surfing, Skiing/Snowboarding, Kayaking, Fishing, Road Trips
- Baseball, Volleyball, Hockey
- Crafts, DIY Projects, Interior Design, Woodworking, Painting, Drawing, Pottery
- Activism, Networking, Public Speaking, Meetups
- Investing, Real Estate, Marketing, Startups
- Sustainability, Minimalism, Astrology, Spirituality, Self-Improvement, Luxury
- Cats, Animal Welfare
- Cars, Motorcycles, Classic Cars
- Collecting, Thrifting, Vintage, Antiques, Magic, Puzzles

#### Categories Kept (44 Total)
**Food & Lifestyle**
- Baking, Coffee, Cooking, Foodie, Wine & Spirits

**Fitness & Outdoors**
- Beach, Camping, Cycling, Fitness, Hiking, Nature, Running, Yoga

**Arts & Entertainment**
- Art, Cinema, Comedy, Concerts, Dance, Design, Fashion, Festivals, Music, Nightlife, Photography, Writing

**Technology & Learning**
- Books, Podcasts, Reading, Science, Tech

**Sports**
- Basketball, Football, Golf, Soccer, Sports Fan, Tennis

**Social & Professional**
- Business, Entrepreneurship, Volunteering

**Pets**
- Dogs, Pets

**Hobbies**
- Gaming, Gardening

---

### 2. ✅ Custom Category Feature

**File**: `components/profile/InterestSelector.tsx`

Users can now create their own interest categories!

#### Features

**Custom Button**
- Displays as a **dashed blue border capsule** with "+ Custom" text
- Stands out from regular categories
- Always visible at the end of the capsule grid

**Custom Input Form**
- Appears when user clicks "+ Custom"
- Blue background card with:
  - Text input (max 30 characters)
  - "Add Category" button (black)
  - "Cancel" button (gray)
- Auto-focuses on the input
- Validates that name isn't empty

**Visual Design**
```
┌─────────────────────────────────────────┐
│ Create Custom Category                  │
│ ┌─────────────────────────────────────┐ │
│ │ e.g. Sailing, Knitting, Poker...   │ │
│ └─────────────────────────────────────┘ │
│ ┌──────────────┐  ┌────────┐           │
│ │ Add Category │  │ Cancel │           │
│ └──────────────┘  └────────┘           │
└─────────────────────────────────────────┘

[Art] [Music] [Tech] ... [+ Custom]
```

**User Flow**
1. User clicks "+ Custom" capsule
2. Blue form appears above capsules
3. User types custom category name (e.g., "Sailing", "Knitting", "Board Games")
4. User clicks "Add Category"
5. Category moves to selected section at top with 3 input fields
6. User fills in their 3 favorite items
7. Custom category is saved with their profile

**Validation**
- ✅ Checks for empty names
- ✅ Prevents duplicate categories
- ✅ Respects 3-category limit
- ✅ 30 character max length

**Storage**
- Custom categories are stored in `detailed_interests` JSON
- No database schema changes needed
- Works exactly like predefined categories

---

### 3. ✅ Adjusted Display Settings

**File**: `components/profile/InterestSelector.tsx`

- Changed `INITIAL_SHOW_COUNT` from 20 to **25**
- With 44 categories total, "Show More" reveals 19 additional interests
- More categories visible by default, less scrolling needed

---

## Benefits

### Curated List (44 Categories)
✅ **Less overwhelming** - 66% reduction from 130+ to 44
✅ **Higher engagement** - Focuses on popular, mainstream interests
✅ **Faster browsing** - Easier to find relevant categories
✅ **Better matching** - More users share common interests
✅ **Cleaner UI** - "Show More" only reveals 19 more (not 110+)

### Custom Category Feature
✅ **Flexibility** - Users aren't limited to predefined options
✅ **Personalization** - Express unique interests (e.g., "Birdwatching", "Woodworking", "Calligraphy")
✅ **Inclusivity** - Niche hobbyists can still represent their passions
✅ **No limits** - Users can create any category (up to 30 chars)
✅ **Same functionality** - Custom categories work identically to predefined ones

---

## Files Modified

1. **`constants/interests.ts`** - Reduced from 130+ to 44 curated categories
2. **`components/profile/InterestSelector.tsx`** - Added custom category feature

---

## Testing Checklist

### Curated List
- [ ] Open onboarding interests step
- [ ] Verify only 44 total categories exist
- [ ] Verify categories are relevant and mainstream
- [ ] Verify "Show More" says "Show 19 More"
- [ ] Verify alphabetical sorting works

### Custom Category
- [ ] Click "+ Custom" capsule
- [ ] Verify blue input form appears
- [ ] Try submitting empty name - should show error
- [ ] Enter "Sailing" and click "Add Category"
- [ ] Verify "Sailing" appears in selected section at top
- [ ] Verify 3 input fields appear for favorites
- [ ] Fill in favorites (e.g., "Newport Harbor", "Catalina Island", "Marina del Rey")
- [ ] Select 2 more categories to hit limit
- [ ] Try clicking "+ Custom" - should show limit error
- [ ] Remove a category
- [ ] Add another custom category
- [ ] Complete onboarding
- [ ] Go to Settings → Edit Interests
- [ ] Verify custom categories are preserved
- [ ] Verify custom categories can be removed like regular ones

### Edge Cases
- [ ] Try adding same custom category twice - should show error
- [ ] Try adding custom category with same name as predefined one - should show error
- [ ] Try very long category name (30+ chars) - should truncate at 30
- [ ] Cancel custom form - verify form disappears
- [ ] Add custom category, then immediately remove it with X button

---

## Example Custom Categories Users Might Create

- **Sports**: Volleyball, Hockey, Baseball, Lacrosse, Rugby, Cricket
- **Hobbies**: Birdwatching, Knitting, Woodworking, Pottery, Calligraphy, Origami
- **Food**: Craft Beer, Vegan Food, Sushi, BBQ, Street Food
- **Outdoor**: Sailing, Surfing, Skiing, Kayaking, Rock Climbing, Fishing
- **Arts**: Theater, Opera, Graffiti, Street Art, Sculpture
- **Games**: Board Games, Chess, Poker, Esports, Tabletop RPGs
- **Learning**: Philosophy, History, Astronomy, Languages, Economics
- **Lifestyle**: Meditation, Minimalism, Astrology, Crystals, Tarot
- **Vehicles**: Motorcycles, Classic Cars, Racing, Aviation
- **Unique**: Magic Tricks, Urban Exploration, Geocaching, Drone Flying

---

## Design Philosophy

### Curation Strategy
- **Mass Appeal**: Keep interests that resonate with largest audience
- **Broad Categories**: Avoid overly specific niches (e.g., "Craft Beer" → users can use custom for this)
- **Social Connection**: Prioritize interests that facilitate meetups and conversation
- **Activity-Based**: Focus on things people *do* rather than abstract concepts

### Custom Feature Design
- **Discoverability**: Dashed border makes it clear it's different from regular options
- **Simplicity**: Single input, two buttons - no complexity
- **Instant Feedback**: Form appears inline, no modals or new screens
- **Consistency**: Custom categories behave identically to predefined ones once created

---

## Future Enhancements (Optional)

- Show popular custom categories created by other users
- Suggest custom category names as user types
- Allow users to share their custom categories
- Analytics on most-created custom categories (to potentially add to main list)
- Emoji support for custom categories
