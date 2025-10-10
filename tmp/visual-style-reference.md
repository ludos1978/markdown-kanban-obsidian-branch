# Visual Tag Style Reference Guide

## Quick Visual Legend

```
COLUMN LEVEL STYLES:
┌─────────────────────────────────────┐
│ ███ WORKFLOW STAGE ███ (headerBar) │ ← Colored bar with white label at top
├─────────────────────────────────────┤
┃                                     │ ← Thick colored left border
┃  Column content here...             │    (Content organization)
┃                                     │
└─────────────────────────────────────┘

TASK/CARD LEVEL STYLES:
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← Colored card background (Status)
│ ▓ Task Title ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │    with white/black text
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├─────────────────────────────────────┤ ← Thin colored border (Content type)
│        PRIORITY        (footerBar)  │ ← Colored bar with label at bottom
└─────────────────────────────────────┘
```

---

## Style Application Matrix

| Where Applied | Style Type | Usage | When to Use |
|---------------|-----------|-------|-------------|
| **Column** | headerBar + label | Workflow stage | Shows pipeline position |
| **Column** | Left border (4px) | Organization | Groups related columns |
| **Task** | footerBar + label | Priority | Urgency/importance |
| **Task** | Card background | Status/Quality | Current state |
| **Task** | Thin border (2px) | Content type | Format indicator |
| **Task** | Header stripe (6px) | Complexity | Difficulty level |
| **Task** | Footer stripe (3px) | Review/Time | Secondary info |
| **Task** | Badge/Icon | Platform/Version | Metadata |

---

## Style Hierarchy (Visual Weight)

### Most Prominent (First Notice)
1. **Card background** - Entire card colored
2. **Column headerBar** - Bold bar across top

### Medium Prominence (Second Notice)
3. **footerBar with label** - Bottom bar with text
4. **Left border (4px)** - Thick column accent

### Subtle (Third Notice)
5. **Thin border (2px)** - Card outline
6. **Header stripe (6px)** - Narrow bar at top

### Very Subtle (Detail Level)
7. **Footer stripe (3px)** - Thin bar at bottom
8. **Badges** - Small icons/labels

---

## Tag Category Assignments

### COLUMN-LEVEL TAGS

#### headerBar with Label (24px height)
**Purpose**: Define WHERE content is in the workflow pipeline
**Visual**: Solid color bar spanning column width, white/black label text
**Tags**:
- Workflow: `#ideas`, `#draft`, `#review`, `#ready`, `#published`, `#archived`
- Product: `#backlog`, `#active`, `#testing`, `#production`, `#deprecated`

**Why this style?**
- Columns are large containers with many items
- HeaderBar is prominent but doesn't overwhelm content
- Label text makes stage instantly clear
- Works well with other task-level styles underneath

#### Left Border (4px thick, solid)
**Purpose**: GROUP columns by theme or product area
**Visual**: Thick vertical stripe on left edge of column
**Tags**:
- Teaching: `#intro`, `#basics`, `#core`, `#advanced`, `#practice`, `#assessment`, `#resources`
- Product: `#frontend`, `#backend`, `#infrastructure`, `#security`, `#bugs`, `#documentation`

**Why this style?**
- Non-intrusive - doesn't cover content
- Quick visual scanning across rows
- Can combine with headerBar (workflow + organization)
- Color-codes thematic sections

---

### TASK-LEVEL TAGS

#### footerBar with Label (20px height)
**Purpose**: Show URGENCY and IMPORTANCE
**Visual**: Colored bar at card bottom with priority label
**Tags**: `#critical`, `#high`, `#medium`, `#low`, `#optional`

**Why this style?**
- Works on any card regardless of status color
- Always visible at card bottom
- Label provides clear priority text
- Doesn't interfere with card content

#### Card Background (full card)
**Purpose**: Show CURRENT STATE and QUALITY
**Visual**: Entire card filled with color, contrasting text
**Tags**:
- Teaching: `#needswork`, `#incomplete`, `#complete`, `#outdated`, `#verified`, `#tested`
- Product: `#blocked`, `#wip`, `#done`, `#bug`, `#feature`, `#refactor`, `#tech-debt`, `#hotfix`

**Why this style?**
- HIGHEST visual impact - instant recognition
- Most important info for quick scanning: "What state is this in?"
- Different enough from borders/bars to not conflict
- One glance tells you if action needed

#### Thin Border (2px solid)
**Purpose**: Indicate FORMAT or CONTENT TYPE
**Visual**: Colored outline around card
**Tags**:
- Teaching: `#slide`, `#video`, `#reading`, `#exercise`, `#quiz`, `#demo`, `#interactive`, `#handout`
- Product: `#epic`, `#story`, `#task`, `#spike`, `#chore`, `#improvement`, `#design`

**Why this style?**
- Subtle - doesn't compete with status color
- Can combine with card background (status + type)
- Adds detail without clutter
- Multiple borders possible (multi-format content)

#### Header Stripe (6px, no label)
**Purpose**: Show COMPLEXITY or DIFFICULTY
**Visual**: Narrow colored bar at top of card (below title)
**Tags**: `#trivial`, `#beginner`, `#intermediate`, `#advanced`, `#expert`

**Why this style?**
- Subtle indicator for planning
- Doesn't need label (color conveys difficulty)
- Doesn't interfere with title or content
- Quick reference for assignment decisions

#### Footer Stripe (3px, no label)
**Purpose**: Track REVIEW STATUS or TIME
**Visual**: Very thin colored line at card bottom
**Tags**:
- Review: `#needs-review`, `#in-review`, `#needs-changes`, `#reviewed`, `#approved`
- Time: `#quick`, `#medium-time`, `#long`

**Why this style?**
- Very subtle - tertiary information
- Can coexist with footerBar (priority)
- No label needed (contextual)
- Adds granular tracking without noise

#### Badge/Icon (small indicator)
**Purpose**: Show PLATFORM, VERSION, or TESTING status
**Visual**: Small colored badge or icon in card corner
**Tags**:
- Platform: `#web`, `#mobile`, `#ios`, `#android`, `#online`, `#in-person`
- Version: `#v1.0`, `#alpha`, `#beta`, `#stable`, `#legacy`
- Testing: `#unit-tested`, `#e2e-tested`, `#security-tested`, `#uat-passed`

**Why this style?**
- Minimal space usage
- Technical metadata
- Can have multiple badges
- Power user feature

---

## Color Selection Logic

### By Tag Category

| Category | Color Intensity | Reason |
|----------|----------------|--------|
| **Critical Priority** | Red (bright) | Maximum attention |
| **High Priority** | Red-Orange (warm) | Urgent attention |
| **Medium Priority** | Blue (calm) | Standard work |
| **Low Priority** | Cyan (cool) | Can wait |
| **Inactive** | Gray (neutral) | Historical |
| | |
| **Needs Work** | Red-Orange (warm) | Action needed |
| **Incomplete** | Yellow (warning) | Missing parts |
| **Complete** | Green (success) | Finished |
| **In Progress** | Yellow (active) | Working |
| **Done** | Green (success) | Accomplished |
| **Blocked** | Red (stop) | Cannot proceed |
| | |
| **Ideas/Planning** | Purple (creative) | Conceptual phase |
| **Active Work** | Blue (productive) | Doing work |
| **Review** | Yellow (checking) | Verification |
| **Ready/Live** | Green (go) | Approved/deployed |

### Semantic Color Families

**Red Family** (Red, Red-Orange, Pink):
- Critical issues, urgent work, errors, bugs, blocking
- Use: `#critical`, `#high`, `#blocked`, `#bug`, `#hotfix`, `#security`

**Orange-Yellow Family** (Orange, Yellow):
- Warnings, review needed, attention required, testing
- Use: `#high`, `#review`, `#testing`, `#needs-changes`, `#incomplete`, `#outdated`

**Green Family** (Green, Lime):
- Success, completion, approval, live status
- Use: `#ready`, `#complete`, `#done`, `#approved`, `#published`, `#production`

**Blue-Cyan Family** (Blue, Cyan):
- Active work, standard priority, progress, implementation
- Use: `#draft`, `#active`, `#medium`, `#wip`, `#verified`, `#staging`

**Purple-Magenta Family** (Purple, Magenta):
- Planning, design, special states, advanced work, refactoring
- Use: `#ideas`, `#planned`, `#advanced`, `#refactor`, `#research`, `#design`

**Gray Family** (Gray, Gray-Blue, Gray-Warm):
- Inactive, optional, archived, documentation, support
- Use: `#archived`, `#optional`, `#unused`, `#deprecated`, `#resources`, `#documentation`

---

## Combining Styles Example

### Teaching Material Card

```
Column Style:
├─ headerBar: "DRAFT" (Blue #88CCEE)
└─ Left border: #intro (Blue #88CCEE)

Card Style:
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ Status: #needswork (Orange #F19557)
│ ▓ React Hooks Introduction ▓▓▓▓▓▓▓ │
│ ▓ @instructor-alice @2024-12-31 ▓▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├─────────────────────────────────────┤ Border: #slide (Blue #88CCEE, 2px)
│ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │ Header stripe: #intermediate (Yellow, 6px)
├─────────────────────────────────────┤
│    HIGH    (footerBar)              │ Priority: #high (Red-Orange #EE7733)
└▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔┘ Footer stripe: #needs-review (Orange, 3px)
```

**Visual Hierarchy**:
1. Orange card background → "needs work" (first notice)
2. "HIGH" footerBar → urgent (second notice)
3. Blue #slide border → presentation format (detail)
4. Yellow intermediate stripe → moderate difficulty (detail)
5. Orange review stripe → awaiting review (subtle detail)

### Product Development Card

```
Column Style:
├─ headerBar: "ACTIVE" (Blue #88CCEE)
└─ Left border: #backend (Cyan #44AA99)

Card Style:
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ Status: #wip (Yellow #E5D889)
│ ▓ User Authentication API ▓▓▓▓▓▓▓▓ │
│ ▓ @dev-alice #requires-db-schema ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├─────────────────────────────────────┤ Border: #feature (Blue #88CCEE, 2px)
│ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │ Header stripe: #advanced (Orange, 6px)
│ [#v2.0] [API] [Unit✓] [Int✓]      │ Badges: version, platform, testing
├─────────────────────────────────────┤
│  CRITICAL  (footerBar)              │ Priority: #critical (Red #CC3311)
└▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔┘ Footer stripe: #in-review (Yellow, 3px)
```

**Visual Hierarchy**:
1. Yellow card background → "work in progress" (first notice)
2. "CRITICAL" red footerBar → highest priority (second notice)
3. Blue #feature border → new functionality (detail)
4. Orange advanced stripe → complex work (detail)
5. Badges → technical metadata (power user detail)

---

## Don'ts and Anti-Patterns

### ❌ Don't: Overwhelming Visual Noise
```
Card with:
- Bright red background
- Thick purple border
- Large green footerBar
- Multiple competing header bars
- Too many badges
```
**Result**: Unreadable, confusing, eye strain

### ✓ Do: Strategic Layering
```
Card with:
- Subtle status background (main info)
- Priority footerBar (urgency)
- Thin type border (format)
- One small badge (platform)
```
**Result**: Clear hierarchy, scannable, professional

### ❌ Don't: Redundant Information
```
- Card background: #complete (green)
- footerBar: #low (cyan)
- Header stripe: #beginner (lime green)
- Badge: "DONE" (green)
```
**Result**: Multiple elements saying "it's done"

### ✓ Do: Complementary Information
```
- Card background: #complete (state)
- footerBar: #medium (priority)
- Border: #video (type)
- Header stripe: #intermediate (complexity)
```
**Result**: Each style adds unique information

### ❌ Don't: Conflicting Signals
```
Column: #archived (gray)
Card: #critical (red) + #wip (yellow)
```
**Result**: Why is critical WIP work in archived column?

### ✓ Do: Consistent Signals
```
Column: #active (blue)
Card: #critical (red) + #wip (yellow)
```
**Result**: Urgent work in active development

---

## Accessibility Best Practices

### Contrast Requirements Met

**All combinations tested**:
- ✓ White text on dark accessible colors (4.5:1+)
- ✓ Black text on light medium colors (4.5:1+)
- ✓ Labels on all bars (not color-alone)
- ✓ Borders have sufficient width (2px minimum)

### Color Blindness Support

**Design decisions**:
- Labels on all bars (text redundancy)
- Intensity variations (light/dark) not just hue
- Multiple style types (shape + color)
- Icon support for badges

**Deuteranopia/Protanopia**:
- Red/Green avoided as only differentiator
- Additional cues: position (header/footer), style (bar/background/border)
- Labels always present

---

## Implementation Priority

### Phase 1: Essential (MVP)
1. Column workflow headerBars
2. Task priority footerBars
3. Task status card backgrounds

**With just these 3, you have**:
- WHERE content is (column)
- HOW URGENT it is (footer)
- WHAT STATE it's in (background)

### Phase 2: Organization (Recommended)
4. Column organization left borders
5. Content type thin borders

**Adds**:
- THEMATIC GROUPING (borders)
- FORMAT INDICATION (type borders)

### Phase 3: Power User (Optional)
6. Complexity header stripes
7. Review/time footer stripes
8. Badges and icons

**Adds**:
- DETAILED TRACKING
- TECHNICAL METADATA
- ADVANCED WORKFLOW

---

## Summary Table

| Tag Purpose | Visual Style | Prominence | Column/Task | Example Tags |
|-------------|-------------|-----------|-------------|--------------|
| **Workflow stage** | headerBar + label | High | Column | #draft, #active, #testing |
| **Organization** | Left border 4px | Medium | Column | #intro, #frontend, #core |
| **Priority** | footerBar + label | High | Task | #critical, #high, #medium |
| **Status/Quality** | Card background | HIGHEST | Task | #wip, #done, #complete |
| **Content type** | Thin border 2px | Low | Task | #slide, #feature, #bug |
| **Complexity** | Header stripe 6px | Low | Task | #beginner, #advanced |
| **Review/Time** | Footer stripe 3px | Very Low | Task | #needs-review, #quick |
| **Metadata** | Badge/Icon | Very Low | Task | #web, #v2.0, #tested |

---

**Quick Reference**: Print this page and keep it handy while tagging!
