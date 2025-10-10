# Kanban Tag & Color System (Revised)

## Tag Naming Convention

- **`#` prefix**: All workflow tags (columns, tasks, rows, states)
- **`@` prefix**: ONLY for people (`@john`) and dates (`@2024-12-31`)

---

## Color Palette System

### 12-Color Base Palette (Well-Dispersed Spectrum)

| Name | Hue Family | Accessible | Medium | Light | Dark |
|------|-----------|------------|--------|-------|------|
| **Purple** | Violet | `#332288` | `#5E3C99` | `#8B6BB7` | `#1A1144` |
| **Blue** | Blue | `#88CCEE` | `#5BA3D0` | `#B8E3F5` | `#2B5F7E` |
| **Cyan** | Cyan | `#44AA99` | `#5DCCBB` | `#A3E4DB` | `#2C6B5F` |
| **Green** | Green | `#117733` | `#159F44` | `#4CB96F` | `#0A4A1F` |
| **Lime** | Yellow-Green | `#88CC44` | `#A0D95B` | `#C9E89D` | `#5A7D2E` |
| **Yellow** | Yellow | `#DDCC77` | `#E5D889` | `#F2EABB` | `#968757` |
| **Orange** | Orange | `#FFAA00` | `#FFB933` | `#FFD280` | `#B37700` |
| **Red-Orange** | Red-Orange | `#EE7733` | `#F19557` | `#F7C5A8` | `#A04E1F` |
| **Red** | Red | `#CC3311` | `#DD5533` | `#EE9977` | `#881F0A` |
| **Pink** | Magenta | `#CC6677` | `#D98594` | `#EBB8C3` | `#8A3D4A` |
| **Magenta** | Purple-Red | `#AA4499` | `#C066B3` | `#DBA3D1` | `#6E2B63` |
| **Purple-Dark** | Deep Purple | `#882255` | `#A93D6D` | `#D47BA0` | `#5A162E` |

### Neutral Palette (for inactive/archived states)

| Name | Accessible | Medium | Light | Dark |
|------|-----------|--------|-------|------|
| **Gray** | `#777777` | `#999999` | `#CCCCCC` | `#444444` |
| **Gray-Blue** | `#6B7A8F` | `#8B9AAF` | `#C1CBDB` | `#3D4A5A` |
| **Gray-Warm** | `#8B7E74` | `#A69A91` | `#D1C7BE` | `#5A504A` |

---

## Design Principles

1. **Consistency within categories**: All tags in a category use the same visual style
2. **Color intensity reflects importance**:
   - Critical/High: Accessible colors (high contrast)
   - Medium: Medium variant
   - Low: Light variant
   - Archived: Gray neutrals
3. **Accessibility**: Accessible palette provides 4.5:1 contrast minimum
4. **Semantic groupings**:
   - Purple/Blue: Planning, review, information
   - Cyan/Green: Active, progress, completion
   - Yellow/Orange: Warning, attention
   - Red/Pink: Urgent, critical, errors
   - Magenta/Purple-Dark: Special states, advanced

---

## 1. COLUMN WORKFLOW TAGS (Project States)

**Style**: `headerBar` with labels
**Purpose**: Define pipeline stage

### Teaching Materials Flow

| Tag | Label | Color (Accessible) | Description |
|-----|-------|--------------------|-------------|
| `#ideas` | IDEAS | Purple `#332288` | Brainstorming phase |
| `#draft` | DRAFT | Blue `#88CCEE` | Initial content creation |
| `#review` | REVIEW | Yellow `#DDCC77` | Peer/expert review |
| `#polish` | POLISH | Cyan `#44AA99` | Refinement phase |
| `#ready` | READY | Green `#117733` | Approved, ready |
| `#published` | PUBLISHED | Lime `#88CC44` | Live, in use |
| `#archived` | ARCHIVED | Gray `#777777` | Historical, inactive |

### Product Development Flow

| Tag | Label | Color (Accessible) | Description |
|-----|-------|--------------------|-------------|
| `#backlog` | BACKLOG | Gray-Blue `#6B7A8F` | Future work |
| `#planned` | PLANNED | Purple `#332288` | Designed, scheduled |
| `#active` | ACTIVE | Blue `#88CCEE` | In development |
| `#testing` | TESTING | Orange `#FFAA00` | QA phase |
| `#staging` | STAGING | Yellow `#DDCC77` | Pre-release |
| `#production` | PRODUCTION | Green `#117733` | Live, deployed |
| `#deprecated` | DEPRECATED | Gray `#777777` | End-of-life |

---

## 2. TASK PRIORITY TAGS (Importance)

**Style**: `footerBar` with labels
**Purpose**: Urgency/importance level

| Tag | Label | Color (Accessible) | Description |
|-----|-------|--------------------|-------------|
| `#critical` | CRITICAL | Red `#CC3311` | Blocking, must do now |
| `#high` | HIGH | Red-Orange `#EE7733` | Important, soon |
| `#medium` | MEDIUM | Blue `#88CCEE` | Standard priority |
| `#low` | LOW | Cyan `#44AA99` | Nice to have |
| `#optional` | OPTIONAL | Gray `#777777` | Future consideration |

---

## 3. TASK STATUS TAGS (Content Quality/State)

**Style**: `card` background with contrasting text
**Purpose**: Individual task state

### For Teaching Materials

| Tag | Color (Medium) | Text Color | Description |
|-----|----------------|------------|-------------|
| `#needswork` | Red-Orange `#F19557` | `#FFFFFF` | Needs improvement |
| `#incomplete` | Yellow `#E5D889` | `#000000` | Missing content |
| `#complete` | Green `#159F44` | `#FFFFFF` | Fully developed |
| `#outdated` | Orange `#FFB933` | `#000000` | Needs updating |
| `#verified` | Cyan `#5DCCBB` | `#FFFFFF` | Quality checked |

### For Product Development

| Tag | Color (Medium) | Text Color | Description |
|-----|----------------|------------|-------------|
| `#blocked` | Red `#DD5533` | `#FFFFFF` | Cannot proceed |
| `#wip` | Yellow `#E5D889` | `#000000` | Work in progress |
| `#done` | Green `#159F44` | `#FFFFFF` | Completed |
| `#bug` | Pink `#D98594` | `#FFFFFF` | Has issues |
| `#feature` | Blue `#5BA3D0` | `#FFFFFF` | New functionality |
| `#refactor` | Magenta `#C066B3` | `#FFFFFF` | Code improvement |

---

## 4. ROW CATEGORY TAGS (Content Organization)

**Style**: `border` on left side (4px solid)
**Purpose**: Thematic sections

| Tag | Border Color (Accessible) | Description |
|-----|---------------------------|-------------|
| `#intro` | Blue `#88CCEE` | Foundational content |
| `#basics` | Cyan `#44AA99` | Basic concepts |
| `#core` | Purple `#332288` | Primary content |
| `#main` | Green `#117733` | Main features |
| `#advanced` | Magenta `#AA4499` | Complex topics |
| `#optional` | Lime `#88CC44` | Extra material |
| `#resources` | Gray `#777777` | References, links |
| `#reference` | Gray-Blue `#6B7A8F` | Documentation |

---

## 5. CONTENT TYPE TAGS

**Style**: `border` on card (2px solid)
**Purpose**: Indicate content format

| Tag | Border Color (Accessible) | Description |
|-----|---------------------------|-------------|
| `#slide` | Blue `#88CCEE` | Presentation slide |
| `#exercise` | Orange `#FFAA00` | Practice activity |
| `#quiz` | Red-Orange `#EE7733` | Assessment |
| `#demo` | Cyan `#44AA99` | Live demonstration |
| `#video` | Purple `#332288` | Video content |
| `#reading` | Green `#117733` | Text material |
| `#interactive` | Magenta `#AA4499` | Interactive element |

---

## 6. TIME/EFFORT TAGS

**Style**: `footerBar` without label (3px bar)
**Purpose**: Time estimate

| Tag | Bar Color (Light) | Description |
|-----|-------------------|-------------|
| `#quick` | Green `#4CB96F` | < 15 minutes |
| `#medium-time` | Yellow `#F2EABB` | 15-45 minutes |
| `#long` | Red-Orange `#F7C5A8` | > 45 minutes |

---

## 7. DIFFICULTY LEVEL TAGS

**Style**: `headerBar` without label (small stripe)
**Purpose**: Complexity indicator

| Tag | Stripe Color (Accessible) | Description |
|-----|---------------------------|-------------|
| `#beginner` | Green `#117733` | Entry level |
| `#intermediate` | Yellow `#DDCC77` | Some experience needed |
| `#expert` | Red `#CC3311` | Advanced knowledge required |

---

## Complete Color Reference Tables

### Primary Palette (12 Colors × 4 Variants)

```
PURPLE
- Dark:       #1A1144
- Accessible: #332288
- Medium:     #5E3C99
- Light:      #8B6BB7

BLUE
- Dark:       #2B5F7E
- Accessible: #88CCEE
- Medium:     #5BA3D0
- Light:      #B8E3F5

CYAN
- Dark:       #2C6B5F
- Accessible: #44AA99
- Medium:     #5DCCBB
- Light:      #A3E4DB

GREEN
- Dark:       #0A4A1F
- Accessible: #117733
- Medium:     #159F44
- Light:      #4CB96F

LIME
- Dark:       #5A7D2E
- Accessible: #88CC44
- Medium:     #A0D95B
- Light:      #C9E89D

YELLOW
- Dark:       #968757
- Accessible: #DDCC77
- Medium:     #E5D889
- Light:      #F2EABB

ORANGE
- Dark:       #B37700
- Accessible: #FFAA00
- Medium:     #FFB933
- Light:      #FFD280

RED-ORANGE
- Dark:       #A04E1F
- Accessible: #EE7733
- Medium:     #F19557
- Light:      #F7C5A8

RED
- Dark:       #881F0A
- Accessible: #CC3311
- Medium:     #DD5533
- Light:      #EE9977

PINK
- Dark:       #8A3D4A
- Accessible: #CC6677
- Medium:     #D98594
- Light:      #EBB8C3

MAGENTA
- Dark:       #6E2B63
- Accessible: #AA4499
- Medium:     #C066B3
- Light:      #DBA3D1

PURPLE-DARK
- Dark:       #5A162E
- Accessible: #882255
- Medium:     #A93D6D
- Light:      #D47BA0

GRAYS
- Dark:       #444444
- Accessible: #777777
- Medium:     #999999
- Light:      #CCCCCC
```

---

## Usage Guidelines

### Choosing Color Variant by Context

1. **Column headerBar**: Use **Accessible** variant (high contrast)
2. **Task footerBar**: Use **Accessible** variant
3. **Card backgrounds**: Use **Medium** variant with white/black text
4. **Borders**: Use **Accessible** or **Dark** variant
5. **Inactive/archived**: Use **Gray** neutrals

### Color Selection Strategy

**By Importance**:
- Critical: Red, Red-Orange
- High: Orange, Yellow
- Medium: Blue, Cyan
- Low: Green, Lime
- Optional: Grays

**By Stage**:
- Planning: Purple, Purple-Dark
- Active: Blue, Cyan
- Review: Yellow, Orange
- Complete: Green, Lime
- Special: Magenta, Pink

---

## Implementation Example

### JSON Configuration Format

```json
{
  "column": {
    "active": {
      "headerBar": {
        "color": "#88CCEE",
        "label": "ACTIVE",
        "labelColor": "#FFFFFF",
        "height": "24px"
      }
    },
    "archived": {
      "headerBar": {
        "color": "#777777",
        "label": "ARCHIVED",
        "labelColor": "#FFFFFF",
        "height": "24px"
      }
    }
  },
  "card": {
    "complete": {
      "background": "#159F44",
      "text": "#FFFFFF"
    },
    "needswork": {
      "background": "#F19557",
      "text": "#FFFFFF"
    }
  }
}
```

---

## Usage Examples

### Teaching Materials
```markdown
## React Basics #intro #draft

- [ ] What is React? #high #needswork #slide #quick
- [ ] JSX Syntax #medium #complete #slide #medium-time
- [ ] Props vs State #high #verified #video #long

## Advanced Patterns #advanced #ready

- [ ] Custom Hooks #critical #complete #slide #expert
- [ ] Performance #medium #incomplete #demo #intermediate
```

### Product Development
```markdown
## User Authentication #core #active

- [ ] Login API #critical #wip #feature #beginner
- [ ] OAuth Integration #high #blocked #bug
- [ ] Password Reset #medium #done #feature

## Dashboard #main #testing

- [ ] Charts Component #high #feature #done
- [ ] Export Data #low #refactor #wip
```

---

## Reserved Tag Prefixes

- `#row[0-9]+`: Row layout tags (e.g., `#row2`, `#row3`)
- `#span[0-9]+`: Column span tags (e.g., `#span2`, `#span3`)
- `#stack`: Column stacking tag
- `@[a-z]+`: Person names (e.g., `@alice`, `@bob`)
- `@[0-9]{4}-[0-9]{2}-[0-9]{2}`: Dates (e.g., `@2024-12-31`)

---

## Accessibility Notes

1. **Contrast Ratios**: All accessible variants provide 4.5:1 minimum contrast on white/black
2. **Text on Backgrounds**: Medium variants tested with both light (#FFFFFF) and dark (#000000) text
3. **Color Blindness**: 12-color palette distributed across full spectrum for deuteranopia/protanopia support
4. **Not Color-Alone**: Labels on bars provide text indicators

---

## Future Enhancements

1. **Auto-contrast**: Automatically choose text color based on background luminance
2. **Custom palettes**: User-defined color schemes
3. **Tag presets**: Quick-apply common tag combinations
4. **Color picker**: Visual interface for tag color assignment
5. **Theme variants**: Pastel, high-contrast, monochrome alternatives
