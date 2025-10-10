# Kanban Tag & Color System Concept

## Design Principles

1. **Consistency within categories**: All tags in a category use the same visual style (headerBar, footerBar, card background, or border)
2. **Color intensity reflects importance**:
   - Critical/High: Bright, saturated colors (60-80% saturation)
   - Medium: Moderate saturation (40-60%)
   - Low/Optional: Muted colors (20-40%)
   - Archived/Inactive: Gray-based (0-15% saturation)
3. **Semantic color families**:
   - Red/Orange: Urgency, problems, attention needed
   - Green: Completion, success, ready state
   - Blue: Active work, information, standard priority
   - Purple: Planning, review, special status
   - Gray: Inactive, archived, optional
4. **Dark/Light mode support**: Each color defined for both themes

---

## 1. COLUMN WORKFLOW TAGS (Project States)

**Style**: `headerBar` with labels
**Purpose**: Define where content is in the production pipeline

### Teaching Materials Flow

| Tag | Label | Light Mode | Dark Mode | Description |
|-----|-------|------------|-----------|-------------|
| `#ideas` | IDEAS | `#9B59B6` (purple, muted) | `#A569BD` | Brainstorming, collection phase |
| `#draft` | DRAFT | `#5DADE2` (light blue) | `#5DADE2` | Initial content creation |
| `#review` | REVIEW | `#F39C12` (orange) | `#E59866` | Peer/expert review phase |
| `#polish` | POLISH | `#16A085` (teal) | `#48C9B0` | Refinement and improvements |
| `#ready` | READY | `#27AE60` (green) | `#52BE80` | Complete, approved for use |
| `#published` | PUBLISHED | `#229954` (bright green) | `#58D68D` | Live, being used |
| `#archived` | ARCHIVED | `#95A5A6` (gray) | `#ABB2B9` | Deprecated, historical |

### Product Development Flow

| Tag | Label | Light Mode | Dark Mode | Description |
|-----|-------|------------|-----------|-------------|
| `#backlog` | BACKLOG | `#85929E` (muted blue) | `#99A3A4` | Not started, future work |
| `#planned` | PLANNED | `#9B59B6` (purple) | `#A569BD` | Scheduled, designed |
| `#active` | ACTIVE | `#3498DB` (bright blue) | `#5DADE2` | Currently in development |
| `#testing` | TESTING | `#E67E22` (orange) | `#EB984E` | QA, bug fixing phase |
| `#staging` | STAGING | `#F4D03F` (yellow) | `#F7DC6F` | Pre-release, final checks |
| `#production` | PRODUCTION | `#27AE60` (green) | `#52BE80` | Deployed, live |
| `#deprecated` | DEPRECATED | `#7B7D7D` (gray) | `#909497` | End-of-life |

---

## 2. TASK PRIORITY TAGS (Importance)

**Style**: `footerBar` with labels
**Purpose**: Indicate task importance and urgency

| Tag | Label | Light Mode | Dark Mode | Description |
|-----|-------|------------|-----------|-------------|
| `@critical` | CRITICAL | `#E74C3C` (bright red) | `#EC7063` | Blocking issue, must do immediately |
| `@high` | HIGH | `#E67E22` (orange) | `#EB984E` | Important, needed soon |
| `@medium` | MEDIUM | `#3498DB` (blue) | `#5DADE2` | Standard priority |
| `@low` | LOW | `#48C9B0` (muted teal) | `#76D7C4` | Nice to have, not urgent |
| `@optional` | OPTIONAL | `#95A5A6` (gray) | `#AEB6BF` | Future consideration |

---

## 3. TASK STATUS TAGS (Content Quality)

**Style**: `card` background colors with contrasting text
**Purpose**: Describe individual task/slide state

### For Teaching Materials

| Tag | Light Background | Light Text | Dark Background | Dark Text | Description |
|-----|-----------------|------------|-----------------|-----------|-------------|
| `@needswork` | `#FADBD8` (light red) | `#922B21` | `#78281F` (dark red) | `#F5B7B1` | Requires significant improvement |
| `@incomplete` | `#FCF3CF` (light yellow) | `#7D6608` | `#7D6608` (dark yellow) | `#F9E79F` | Missing content or information |
| `@complete` | `#D5F4E6` (light green) | `#0B5345` | `#0E6251` (dark green) | `#A9DFBF` | Fully developed, ready |
| `@outdated` | `#FAE5D3` (light brown) | `#6E2C00` | `#6E2C00` (dark brown) | `#F5CBA7` | Needs updating/revision |
| `@verified` | `#D6EAF8` (light blue) | `#1B4F72` | `#1B4F72` (dark blue) | `#AED6F1` | Quality checked, peer-reviewed |

### For Product Development

| Tag | Light Background | Light Text | Dark Background | Dark Text | Description |
|-----|-----------------|------------|-----------------|-----------|-------------|
| `@blocked` | `#FADBD8` (light red) | `#922B21` | `#78281F` (dark red) | `#F5B7B1` | Cannot proceed, dependency issue |
| `@wip` | `#FCF3CF` (light yellow) | `#7D6608` | `#7D6608` (dark yellow) | `#F9E79F` | Work in progress |
| `@done` | `#D5F4E6` (light green) | `#0B5345` | `#0E6251` (dark green) | `#A9DFBF` | Task completed |
| `@bug` | `#F5CBA7` (light pink) | `#943126` | `#78281F` (dark pink) | `#F5B7B1` | Has issues, needs fixing |
| `@feature` | `#D6EAF8` (light blue) | `#1B4F72` | `#1B4F72` (dark blue) | `#AED6F1` | New functionality |
| `@refactor` | `#E8DAEF` (light purple) | `#4A235A` | `#512E5F` (dark purple) | `#D7BDE2` | Code improvement, no new features |

---

## 4. ROW CATEGORY TAGS (Content Organization)

**Style**: `border` on left side (4px solid)
**Purpose**: Organize content into thematic sections

| Tag | Border Light | Border Dark | Description |
|-----|-------------|-------------|-------------|
| `#intro` / `#basics` | `#3498DB` (blue) | `#5DADE2` | Foundational content, prerequisites |
| `#core` / `#main` | `#8E44AD` (purple) | `#A569BD` | Primary content, main features |
| `#advanced` / `#optional` | `#16A085` (teal) | `#48C9B0` | Complex topics, optional material |
| `#resources` / `#reference` | `#7F8C8D` (gray) | `#95A5A6` | Supporting materials, links, docs |

---

## 5. ADDITIONAL UTILITY TAGS

**Style**: Various (specified per tag)
**Purpose**: Special markers and modifiers

### Content Type Markers (card border, thin)

| Tag | Border Color Light | Border Color Dark | Description |
|-----|-------------------|-------------------|-------------|
| `@slide` | `#3498DB` (blue, 2px) | `#5DADE2` | Presentation slide |
| `@exercise` | `#F39C12` (orange, 2px) | `#F8C471` | Practice activity |
| `@quiz` | `#E74C3C` (red, 2px) | `#EC7063` | Assessment question |
| `@demo` | `#16A085` (teal, 2px) | `#48C9B0` | Live demonstration |
| `@video` | `#9B59B6` (purple, 2px) | `#A569BD` | Video content |

### Time Estimates (footer bar, no label)

| Tag | Bar Color Light | Bar Color Dark | Description |
|-----|----------------|----------------|-------------|
| `@quick` | `#52BE80` (green, 3px) | `#7DCEA0` | < 15 minutes |
| `@medium` | `#F8C471` (yellow, 3px) | `#FAD7A0` | 15-45 minutes |
| `@long` | `#EC7063` (red, 3px) | `#F1948A` | > 45 minutes |

---

## Color Palette Reference

### Primary Colors (by function)

```css
/* SUCCESS / COMPLETE */
Light: #27AE60, #52BE80, #D5F4E6
Dark:  #0E6251, #7DCEA0, #A9DFBF

/* ACTIVE / IN-PROGRESS */
Light: #3498DB, #5DADE2, #D6EAF8
Dark:  #1B4F72, #85C1E9, #AED6F1

/* WARNING / ATTENTION */
Light: #F39C12, #E67E22, #FCF3CF
Dark:  #7D6608, #EB984E, #F9E79F

/* CRITICAL / URGENT */
Light: #E74C3C, #C0392B, #FADBD8
Dark:  #78281F, #EC7063, #F5B7B1

/* REVIEW / SPECIAL */
Light: #9B59B6, #8E44AD, #E8DAEF
Dark:  #512E5F, #A569BD, #D7BDE2

/* INACTIVE / ARCHIVED */
Light: #95A5A6, #7F8C8D, #ECF0F1
Dark:  #5D6D7E, #ABB2B9, #D5DBDB
```

### Saturation Levels

- **High Priority (60-80% saturation)**: @critical, @high, #active, #published
- **Medium Priority (40-60% saturation)**: @medium, #draft, #review, #testing
- **Low Priority (20-40% saturation)**: @low, #planned, #ideas
- **Inactive (0-15% saturation)**: @optional, #archived, #deprecated

---

## Implementation Guidelines

### 1. Tag Configuration Format

```json
{
  "column": {
    "tagname": {
      "headerBar": {
        "color": "#3498DB",
        "label": "ACTIVE",
        "labelColor": "#FFFFFF",
        "height": "24px"
      },
      "light": {
        "background": "#3498DB",
        "text": "#FFFFFF"
      },
      "dark": {
        "background": "#5DADE2",
        "text": "#1C2833"
      }
    }
  },
  "card": {
    "tagname": {
      "light": {
        "background": "#D6EAF8",
        "text": "#1B4F72"
      },
      "dark": {
        "background": "#1B4F72",
        "text": "#AED6F1"
      }
    }
  }
}
```

### 2. Category-Specific Rules

**Column Workflow Tags** (ALL use headerBar):
- Always include label
- Header height: 24px
- Label color: White or dark for contrast
- Hide the tag itself in column title

**Task Priority Tags** (ALL use footerBar):
- Always include label
- Footer height: 20px
- Label color: White or dark for contrast
- Position: Bottom of card

**Task Status Tags** (ALL use card background):
- Full card background color
- Ensure text contrast (WCAG AA minimum 4.5:1)
- Show tag inline in title

**Row Category Tags** (ALL use left border):
- Border width: 4px
- Border style: solid
- Applied to column header
- Tag hidden in title

---

## Usage Examples

### Teaching Materials Example
```markdown
## Introduction to React #intro #draft

- [ ] What is React? @high @needswork @slide
- [ ] JSX Basics @medium @complete @slide
- [ ] Component Lifecycle @medium @complete @video
- [ ] Practice: First Component @low @incomplete @exercise

## Advanced Patterns #advanced #ready

- [ ] Custom Hooks @high @verified @slide
- [ ] Performance Optimization @medium @complete @demo
```

### Product Development Example
```markdown
## User Authentication #core #active

- [ ] Login API @critical @wip @feature
- [ ] Password Reset @high @blocked @bug
- [ ] OAuth Integration @low @done @feature

## Dashboard #main #testing

- [ ] Charts Component @high @done @feature
- [ ] Data Export @medium @wip @feature
- [ ] User Preferences @low @refactor
```

---

## Accessibility Notes

1. **Color Contrast**: All text/background combinations meet WCAG AA standards (4.5:1 minimum)
2. **Not Color-Alone**: Labels on footerBar and headerBar provide text indicators
3. **Dark Mode**: Separate color definitions ensure readability in both themes
4. **Border Indicators**: Row categories use borders, not just background colors

---

## Future Enhancements

1. **Custom color picker**: Allow users to define their own tag colors
2. **Tag templates**: Pre-configured sets for different workflows
3. **Color schemes**: Alternative palettes (pastel, high-contrast, monochrome)
4. **Tag inheritance**: Child tags inherit parent category styling
5. **Tag combinations**: Visual handling when multiple tag types are present
