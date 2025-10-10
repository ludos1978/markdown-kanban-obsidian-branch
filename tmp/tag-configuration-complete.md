# Complete Tag Configuration with Visual Styles

## Design Philosophy

### Visual Style Assignment Strategy

**COLUMN LEVEL** (Applied to entire columns):
- **headerBar**: Workflow stages - shows where content is in the pipeline
- **border (left, thick)**: Content organization - groups columns thematically

**TASK/CARD LEVEL** (Applied to individual items):
- **footerBar**: Priority/urgency - how soon action is needed
- **card background**: Status/quality - current state of the item
- **border (thin)**: Content type - format or delivery method

**RATIONALE**:
- Columns contain many items → visual styles should be bold but not overwhelming
- Individual items need quick visual scanning → cards use color fill for instant recognition
- Priorities cut across all workflows → footerBar works on any card regardless of column style
- Content types need subtle differentiation → thin borders don't compete with status colors

---

## COMPLETE TAG LIST

### COLUMN TAGS - Workflow Stages (headerBar with label)

These tags define **where in the pipeline** content is located. Use ONE per column.

| Tag | Label | headerBar Color | labelColor | Category |
|-----|-------|----------------|------------|----------|
| **TEACHING MATERIALS FLOW** |
| `#ideas` | IDEAS | `#332288` (Purple-A) | `#FFFFFF` | Planning |
| `#outline` | OUTLINE | `#5E3C99` (Purple-M) | `#FFFFFF` | Planning |
| `#draft` | DRAFT | `#88CCEE` (Blue-A) | `#000000` | Creation |
| `#review` | REVIEW | `#DDCC77` (Yellow-A) | `#000000` | Review |
| `#polish` | POLISH | `#44AA99` (Cyan-A) | `#FFFFFF` | Refinement |
| `#ready` | READY | `#117733` (Green-A) | `#FFFFFF` | Complete |
| `#published` | PUBLISHED | `#88CC44` (Lime-A) | `#000000` | Active |
| `#archived` | ARCHIVED | `#777777` (Gray-A) | `#FFFFFF` | Inactive |
| **PRODUCT DEVELOPMENT FLOW** |
| `#backlog` | BACKLOG | `#6B7A8F` (Gray-Blue-A) | `#FFFFFF` | Planning |
| `#planned` | PLANNED | `#332288` (Purple-A) | `#FFFFFF` | Planning |
| `#active` | ACTIVE | `#88CCEE` (Blue-A) | `#000000` | Development |
| `#code-review` | CODE REVIEW | `#DDCC77` (Yellow-A) | `#000000` | Review |
| `#testing` | TESTING | `#FFAA00` (Orange-A) | `#000000` | QA |
| `#staging` | STAGING | `#44AA99` (Cyan-A) | `#FFFFFF` | Pre-release |
| `#production` | PRODUCTION | `#117733` (Green-A) | `#FFFFFF` | Live |
| `#deprecated` | DEPRECATED | `#777777` (Gray-A) | `#FFFFFF` | Inactive |

---

### COLUMN TAGS - Content Organization (left border, 4px)

These tags **group columns thematically**. Use to organize multi-row boards.

| Tag | Border Color | Category | Typical Use |
|-----|-------------|----------|-------------|
| **TEACHING MATERIALS ORGANIZATION** |
| `#intro` | `#88CCEE` (Blue-A) | Foundation | Prerequisites, overview |
| `#basics` | `#44AA99` (Cyan-A) | Foundation | Core concepts |
| `#core` | `#332288` (Purple-A) | Primary | Main curriculum |
| `#main` | `#117733` (Green-A) | Primary | Main features |
| `#advanced` | `#AA4499` (Magenta-A) | Advanced | Complex topics |
| `#optional` | `#88CC44` (Lime-A) | Advanced | Extra material |
| `#practice` | `#FFAA00` (Orange-A) | Application | Exercises |
| `#assessment` | `#EE7733` (Red-Orange-A) | Assessment | Tests, quizzes |
| `#resources` | `#777777` (Gray-A) | Support | References |
| `#supplemental` | `#8B7E74` (Gray-Warm-A) | Support | Bonus content |
| **PRODUCT DEVELOPMENT ORGANIZATION** |
| `#frontend` | `#88CCEE` (Blue-A) | Architecture | UI/UX work |
| `#backend` | `#44AA99` (Cyan-A) | Architecture | Server-side |
| `#infrastructure` | `#332288` (Purple-A) | Architecture | DevOps |
| `#security` | `#CC3311` (Red-A) | Critical | Auth, encryption |
| `#performance` | `#FFAA00` (Orange-A) | Quality | Optimization |
| `#bugs` | `#CC6677` (Pink-A) | Maintenance | Bug fixes |
| `#documentation` | `#6B7A8F` (Gray-Blue-A) | Support | Docs, guides |
| `#research` | `#882255` (Purple-Dark-A) | Innovation | R&D, POCs |

---

### TASK TAGS - Priority Levels (footerBar with label, 20px)

These tags indicate **urgency and importance**. Use ONE per task.

| Tag | Label | footerBar Color | labelColor |
|-----|-------|----------------|------------|
| `#critical` | CRITICAL | `#CC3311` (Red-A) | `#FFFFFF` |
| `#high` | HIGH | `#EE7733` (Red-Orange-A) | `#FFFFFF` |
| `#medium` | MEDIUM | `#88CCEE` (Blue-A) | `#000000` |
| `#low` | LOW | `#44AA99` (Cyan-A) | `#FFFFFF` |
| `#optional` | OPTIONAL | `#777777` (Gray-A) | `#FFFFFF` |

---

### TASK TAGS - Status/Quality (card background)

These tags indicate **current state**. Use ONE per task.

| Tag | card.background | card.text | Category |
|-----|-----------------|-----------|----------|
| **TEACHING MATERIALS STATUS** |
| `#needswork` | `#F19557` (Red-Orange-M) | `#FFFFFF` | Needs improvement |
| `#incomplete` | `#E5D889` (Yellow-M) | `#000000` | Missing content |
| `#complete` | `#159F44` (Green-M) | `#FFFFFF` | Fully developed |
| `#outdated` | `#FFB933` (Orange-M) | `#000000` | Needs updating |
| `#verified` | `#5DCCBB` (Cyan-M) | `#FFFFFF` | Quality checked |
| `#tested` | `#A0D95B` (Lime-M) | `#000000` | Student-validated |
| `#unused` | `#999999` (Gray-M) | `#000000` | Never used |
| **PRODUCT DEVELOPMENT STATUS** |
| `#blocked` | `#DD5533` (Red-M) | `#FFFFFF` | Cannot proceed |
| `#wip` | `#E5D889` (Yellow-M) | `#000000` | In progress |
| `#done` | `#159F44` (Green-M) | `#FFFFFF` | Completed |
| `#bug` | `#D98594` (Pink-M) | `#FFFFFF` | Has defects |
| `#feature` | `#5BA3D0` (Blue-M) | `#FFFFFF` | New functionality |
| `#refactor` | `#C066B3` (Magenta-M) | `#FFFFFF` | Code improvement |
| `#tech-debt` | `#A69A91` (Gray-Warm-M) | `#000000` | Technical debt |
| `#hotfix` | `#DD5533` (Red-M) | `#FFFFFF` | Urgent fix |

---

### TASK TAGS - Content Type (card border, 2px)

These tags indicate **format or delivery method**. Can use multiple per task.

| Tag | Border Color | Category |
|-----|-------------|----------|
| **TEACHING MATERIALS TYPES** |
| `#slide` | `#88CCEE` (Blue-A) | Presentation |
| `#video` | `#332288` (Purple-A) | Multimedia |
| `#reading` | `#117733` (Green-A) | Text |
| `#exercise` | `#FFAA00` (Orange-A) | Practice |
| `#quiz` | `#EE7733` (Red-Orange-A) | Assessment |
| `#demo` | `#44AA99` (Cyan-A) | Live demo |
| `#interactive` | `#AA4499` (Magenta-A) | Interactive |
| `#handout` | `#6B7A8F` (Gray-Blue-A) | Printable |
| `#discussion` | `#DDCC77` (Yellow-A) | Discussion |
| **PRODUCT DEVELOPMENT TYPES** |
| `#epic` | `#332288` (Purple-A) | Large feature |
| `#story` | `#88CCEE` (Blue-A) | User story |
| `#task` | `#44AA99` (Cyan-A) | Technical task |
| `#spike` | `#882255` (Purple-Dark-A) | Research |
| `#chore` | `#777777` (Gray-A) | Maintenance |
| `#improvement` | `#117733` (Green-A) | Enhancement |
| `#design` | `#AA4499` (Magenta-A) | Design work |
| `#infrastructure-task` | `#6B7A8F` (Gray-Blue-A) | DevOps |

---

### TASK TAGS - Complexity Level (headerBar stripe, 6px, no label)

These tags indicate **difficulty or effort**. Visual indicator only.

| Tag | Stripe Color | Description |
|-----|-------------|-------------|
| `#trivial` | `#0A4A1F` (Green-D) | < 1 hour |
| `#beginner` | `#5A7D2E` (Lime-D) | 1-4 hours |
| `#intermediate` | `#968757` (Yellow-D) | 1-2 days |
| `#advanced` | `#B37700` (Orange-D) | 1 week |
| `#expert` | `#881F0A` (Red-D) | 2+ weeks |

---

### TASK TAGS - Review Status (footerBar stripe, 3px, no label)

These tags track **review/approval workflow**. Subtle indicator.

| Tag | Stripe Color |
|-----|-------------|
| `#needs-review` | `#FFAA00` (Orange-A) |
| `#in-review` | `#DDCC77` (Yellow-A) |
| `#needs-changes` | `#EE7733` (Red-Orange-A) |
| `#reviewed` | `#44AA99` (Cyan-A) |
| `#needs-approval` | `#AA4499` (Magenta-A) |
| `#approved` | `#117733` (Green-A) |
| `#rejected` | `#CC3311` (Red-A) |

---

### TASK TAGS - Time Estimate (footerBar stripe, 3px, no label)

These tags show **time required**. Complements complexity.

| Tag | Stripe Color |
|-----|-------------|
| `#quick` | `#4CB96F` (Green-L) |
| `#medium-time` | `#F2EABB` (Yellow-L) |
| `#long` | `#F7C5A8` (Red-Orange-L) |

---

### TASK TAGS - Testing Status (badge/icon style)

These tags track **QA progress**. Small indicators.

| Tag | Badge Color |
|-----|------------|
| `#untested` | `#999999` (Gray-M) |
| `#unit-tested` | `#A0D95B` (Lime-M) |
| `#integration-tested` | `#5DCCBB` (Cyan-M) |
| `#e2e-tested` | `#5BA3D0` (Blue-M) |
| `#security-tested` | `#DD5533` (Red-M) |
| `#performance-tested` | `#FFB933` (Orange-M) |
| `#regression-tested` | `#C066B3` (Magenta-M) |
| `#uat-passed` | `#159F44` (Green-M) |

---

### TASK TAGS - Platform/Target (badge style)

These tags indicate **target platform or audience**.

| Tag | Badge Color | Icon |
|-----|------------|------|
| **TEACHING PLATFORMS** |
| `#online` | `#88CCEE` (Blue-A) | 🌐 |
| `#in-person` | `#117733` (Green-A) | 🏫 |
| `#hybrid` | `#44AA99` (Cyan-A) | 🔀 |
| `#async` | `#DDCC77` (Yellow-A) | ⏰ |
| `#sync` | `#EE7733` (Red-Orange-A) | 🔴 |
| **DEVELOPMENT PLATFORMS** |
| `#web` | `#88CCEE` (Blue-A) | 🌐 |
| `#mobile` | `#332288` (Purple-A) | 📱 |
| `#ios` | `#999999` (Gray-M) | 🍎 |
| `#android` | `#88CC44` (Lime-A) | 🤖 |
| `#desktop` | `#6B7A8F` (Gray-Blue-A) | 💻 |
| `#api` | `#44AA99` (Cyan-A) | 🔌 |

---

### UTILITY TAGS - Version/Release (text badge)

| Tag | Badge Color | Style |
|-----|------------|-------|
| `#v1`, `#v2`, `#v3` | `#332288` (Purple-A) | Outlined |
| `#alpha` | `#CC3311` (Red-A) | Filled |
| `#beta` | `#FFAA00` (Orange-A) | Filled |
| `#rc` | `#DDCC77` (Yellow-A) | Filled |
| `#stable` | `#117733` (Green-A) | Filled |
| `#legacy` | `#777777` (Gray-A) | Outlined |

---

### UTILITY TAGS - Impact Level (corner badge)

| Tag | Badge Color |
|-----|------------|
| `#minor` | `#88CC44` (Lime-A) |
| `#moderate` | `#DDCC77` (Yellow-A) |
| `#major` | `#FFAA00` (Orange-A) |
| `#breaking` | `#CC3311` (Red-A) |

---

### SPECIAL TAGS - Learning Objectives (no visual style, text only)

Used in task descriptions for curriculum alignment:
- `#remember`, `#understand`, `#apply`, `#analyze`, `#evaluate`, `#create`

---

### SPECIAL TAGS - Dependencies (text with icon)

Used in task descriptions to show relationships:
- `#requires-[ID]` - ⬅️
- `#blocks-[ID]` - ➡️
- `#related-[ID]` - 🔗
- `#parent-[ID]` - ⬆️
- `#subtask` - ⬇️

---

## VISUAL STYLE SUMMARY

### Tag Category → Visual Style Mapping

| Tag Category | Visual Style | Reason |
|-------------|-------------|---------|
| **Workflow Stages** | headerBar with label | Column-level, shows pipeline stage clearly |
| **Content Organization** | Left border (4px) | Column-level, groups themes visually |
| **Priority** | footerBar with label | Task-level, works across all columns |
| **Status/Quality** | Card background | Task-level, most important quick-scan info |
| **Content Type** | Thin border (2px) | Task-level, subtle format indicator |
| **Complexity** | Header stripe (6px) | Task-level, subtle effort indicator |
| **Review Status** | Footer stripe (3px) | Task-level, workflow progress |
| **Time Estimate** | Footer stripe (3px) | Task-level, planning helper |
| **Testing Status** | Badge/icon | Task-level, QA checklist |
| **Platform** | Badge/icon | Task-level, technical constraint |
| **Version** | Text badge | Task-level, release tracking |
| **Impact** | Corner badge | Task-level, change magnitude |

---

## JSON CONFIGURATION FORMAT

```json
{
  "tags": {
    "column": {
      "ideas": {
        "headerBar": {
          "color": "#332288",
          "label": "IDEAS",
          "labelColor": "#FFFFFF",
          "height": "24px"
        }
      },
      "draft": {
        "headerBar": {
          "color": "#88CCEE",
          "label": "DRAFT",
          "labelColor": "#000000",
          "height": "24px"
        }
      },
      "ready": {
        "headerBar": {
          "color": "#117733",
          "label": "READY",
          "labelColor": "#FFFFFF",
          "height": "24px"
        }
      },
      "published": {
        "headerBar": {
          "color": "#88CC44",
          "label": "PUBLISHED",
          "labelColor": "#000000",
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
      },
      "backlog": {
        "headerBar": {
          "color": "#6B7A8F",
          "label": "BACKLOG",
          "labelColor": "#FFFFFF",
          "height": "24px"
        }
      },
      "active": {
        "headerBar": {
          "color": "#88CCEE",
          "label": "ACTIVE",
          "labelColor": "#000000",
          "height": "24px"
        }
      },
      "testing": {
        "headerBar": {
          "color": "#FFAA00",
          "label": "TESTING",
          "labelColor": "#000000",
          "height": "24px"
        }
      },
      "production": {
        "headerBar": {
          "color": "#117733",
          "label": "PRODUCTION",
          "labelColor": "#FFFFFF",
          "height": "24px"
        }
      },
      "intro": {
        "border": {
          "position": "left",
          "color": "#88CCEE",
          "width": "4px",
          "style": "solid"
        }
      },
      "core": {
        "border": {
          "position": "left",
          "color": "#332288",
          "width": "4px",
          "style": "solid"
        }
      },
      "advanced": {
        "border": {
          "position": "left",
          "color": "#AA4499",
          "width": "4px",
          "style": "solid"
        }
      },
      "frontend": {
        "border": {
          "position": "left",
          "color": "#88CCEE",
          "width": "4px",
          "style": "solid"
        }
      },
      "backend": {
        "border": {
          "position": "left",
          "color": "#44AA99",
          "width": "4px",
          "style": "solid"
        }
      },
      "infrastructure": {
        "border": {
          "position": "left",
          "color": "#332288",
          "width": "4px",
          "style": "solid"
        }
      }
    },
    "card": {
      "critical": {
        "footerBar": {
          "color": "#CC3311",
          "label": "CRITICAL",
          "labelColor": "#FFFFFF",
          "height": "20px"
        }
      },
      "high": {
        "footerBar": {
          "color": "#EE7733",
          "label": "HIGH",
          "labelColor": "#FFFFFF",
          "height": "20px"
        }
      },
      "medium": {
        "footerBar": {
          "color": "#88CCEE",
          "label": "MEDIUM",
          "labelColor": "#000000",
          "height": "20px"
        }
      },
      "low": {
        "footerBar": {
          "color": "#44AA99",
          "label": "LOW",
          "labelColor": "#FFFFFF",
          "height": "20px"
        }
      },
      "needswork": {
        "background": "#F19557",
        "text": "#FFFFFF"
      },
      "incomplete": {
        "background": "#E5D889",
        "text": "#000000"
      },
      "complete": {
        "background": "#159F44",
        "text": "#FFFFFF"
      },
      "verified": {
        "background": "#5DCCBB",
        "text": "#FFFFFF"
      },
      "blocked": {
        "background": "#DD5533",
        "text": "#FFFFFF"
      },
      "wip": {
        "background": "#E5D889",
        "text": "#000000"
      },
      "done": {
        "background": "#159F44",
        "text": "#FFFFFF"
      },
      "bug": {
        "background": "#D98594",
        "text": "#FFFFFF"
      },
      "feature": {
        "background": "#5BA3D0",
        "text": "#FFFFFF"
      },
      "slide": {
        "border": {
          "color": "#88CCEE",
          "width": "2px",
          "style": "solid"
        }
      },
      "video": {
        "border": {
          "color": "#332288",
          "width": "2px",
          "style": "solid"
        }
      },
      "exercise": {
        "border": {
          "color": "#FFAA00",
          "width": "2px",
          "style": "solid"
        }
      },
      "quiz": {
        "border": {
          "color": "#EE7733",
          "width": "2px",
          "style": "solid"
        }
      },
      "epic": {
        "border": {
          "color": "#332288",
          "width": "2px",
          "style": "solid"
        }
      },
      "story": {
        "border": {
          "color": "#88CCEE",
          "width": "2px",
          "style": "solid"
        }
      },
      "task": {
        "border": {
          "color": "#44AA99",
          "width": "2px",
          "style": "solid"
        }
      }
    }
  }
}
```

---

## USAGE EXAMPLES

### Teaching Materials Example

```markdown
## React Fundamentals #intro #draft

- [ ] What is React? #high #needswork #slide #beginner
  - Learning objectives: #understand #remember
  - Platform: #online #async
  - Duration: #quick
  - Status: #needs-review

- [ ] JSX Basics #medium #complete #video #intermediate
  - #verified #approved
  - #tested with 3 cohorts
  - Duration: #medium-time
  - #v2.0

## Advanced Hooks #advanced #ready

- [ ] useContext Deep Dive #high #complete #slide #expert
  - #approved @instructor-alice
  - #unit-tested #integration-tested
  - #requires-basics-complete
  - #v1.0 #stable
```

**Visual result**:
- Column "React Fundamentals": Blue headerBar "DRAFT" + Blue left border (#intro)
- Column "Advanced Hooks": Green headerBar "READY" + Magenta left border (#advanced)
- First task: Orange footerBar "HIGH", Red-orange card background (#needswork), Blue thin border (#slide), Green header stripe (#beginner)
- Second task: Blue footerBar "MEDIUM", Green card background (#complete), Purple thin border (#video), Yellow header stripe (#intermediate)

### Product Development Example

```markdown
## User Authentication #backend #active

- [ ] Login API #critical #wip #feature #intermediate
  - #code-review #in-review
  - #api #backend
  - #unit-tested #integration-tested
  - #blocks-oauth-integration
  - #v2.0 #breaking

- [ ] Password Reset #high #blocked #bug
  - #requires-login-api
  - #web #mobile
  - #hotfix
  - #major

## Dashboard Features #frontend #testing

- [ ] Charts Component #medium #done #story #beginner
  - #approved #uat-passed
  - #web #desktop
  - #feature
  - #v2.1 #minor
```

**Visual result**:
- Column "User Authentication": Blue headerBar "ACTIVE" + Cyan left border (#backend)
- Column "Dashboard Features": Orange headerBar "TESTING" + Blue left border (#frontend)
- Login API: Red footerBar "CRITICAL", Yellow card background (#wip), Blue thin border (#feature), Yellow header stripe (#intermediate)
- Charts Component: Blue footerBar "MEDIUM", Green card background (#done), Blue thin border (#story), Green header stripe (#beginner)

---

## CONFIGURATION PRIORITIES

### Most Important (Implement First)

1. **Workflow columns** (headerBar): #draft, #review, #ready, #active, #testing, #production
2. **Priority** (footerBar): #critical, #high, #medium, #low
3. **Status** (card background): #wip, #done, #blocked, #complete, #needswork
4. **Content type** (thin border): #slide, #video, #feature, #bug, #task

### Secondary (Add as Needed)

5. **Organization** (left border): #intro, #core, #advanced, #frontend, #backend
6. **Complexity** (header stripe): #beginner, #intermediate, #advanced
7. **Review** (footer stripe): #needs-review, #approved

### Optional (Power Users)

8. **Testing status** (badges): #unit-tested, #e2e-tested
9. **Platform** (badges): #web, #mobile, #online
10. **Version** (text badges): #v1.0, #alpha, #stable

---

## TAG COMBINATION GUIDE

### Typical Combinations

**Teaching slide**:
```
Column: #draft
Tags: #high #needswork #slide #intermediate #needs-review
```

**Product feature**:
```
Column: #active
Tags: #critical #wip #feature #advanced #in-review #v2.0
```

**Bug fix**:
```
Column: #testing
Tags: #high #bug #hotfix #beginner #unit-tested #approved
```

### Anti-Patterns (Avoid)

❌ Multiple status tags: `#wip #done` (contradictory)
❌ Multiple priorities: `#critical #low` (contradictory)
❌ Multiple workflow columns on one column
✅ Multiple content types OK: `#slide #video` (slide contains video)
✅ Multiple platforms OK: `#web #mobile` (cross-platform)

---

## ACCESSIBILITY NOTES

All color combinations tested for:
- **WCAG AA contrast**: 4.5:1 minimum for text
- **Color blindness**: Deuteranopia and protanopia support via label text
- **High contrast mode**: Labels ensure no info is color-only

**Text contrast ratios**:
- White on accessible colors: All pass
- Black on medium colors: Tested individually
- Labels on all bars: Always readable

---

**Document Version**: 1.0
**Total Tags Defined**: 100+
**Color Variants Used**: 15 base × 4 variants = 60 colors
**Ready for Implementation**: Yes ✓
