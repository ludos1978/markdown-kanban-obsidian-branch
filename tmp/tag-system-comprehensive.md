# Comprehensive Kanban Tag & Color System

## Executive Summary

This document defines a complete tag and color system for:
1. **Teaching Materials Development**: Curriculum design, content creation, quality assurance
2. **Product Development**: Software/game/UX design, agile workflows, release management

**Core Principles**:
- All workflow tags use `#` prefix
- `@` reserved for people (@name) and dates (@YYYY-MM-DD)
- 15-color palette with 4 variants each (Dark, Accessible, Medium, Light)
- Consistent styling within tag categories
- Semantic color assignment

---

## Complete Color Palette (15 Colors)

### Primary Colors (12 + 3 Grays = 15 Total)

| # | Name | Dark | Accessible | Medium | Light | Use Cases |
|---|------|------|------------|--------|-------|-----------|
| 1 | **Purple** | `#1A1144` | `#332288` | `#5E3C99` | `#8B6BB7` | Planning, ideation, design |
| 2 | **Blue** | `#2B5F7E` | `#88CCEE` | `#5BA3D0` | `#B8E3F5` | Active work, standard priority |
| 3 | **Cyan** | `#2C6B5F` | `#44AA99` | `#5DCCBB` | `#A3E4DB` | Progress, implementation |
| 4 | **Green** | `#0A4A1F` | `#117733` | `#159F44` | `#4CB96F` | Complete, approved, success |
| 5 | **Lime** | `#5A7D2E` | `#88CC44` | `#A0D95B` | `#C9E89D` | Published, live, validated |
| 6 | **Yellow** | `#968757` | `#DDCC77` | `#E5D889` | `#F2EABB` | Review, warning, pending |
| 7 | **Orange** | `#B37700` | `#FFAA00` | `#FFB933` | `#FFD280` | Attention needed, testing |
| 8 | **Red-Orange** | `#A04E1F` | `#EE7733` | `#F19557` | `#F7C5A8` | High priority, issues |
| 9 | **Red** | `#881F0A` | `#CC3311` | `#DD5533` | `#EE9977` | Critical, blocking, errors |
| 10 | **Pink** | `#8A3D4A` | `#CC6677` | `#D98594` | `#EBB8C3` | Bugs, defects, problems |
| 11 | **Magenta** | `#6E2B63` | `#AA4499` | `#C066B3` | `#DBA3D1` | Special, refactor, advanced |
| 12 | **Purple-Dark** | `#5A162E` | `#882255` | `#A93D6D` | `#D47BA0` | Research, experimental |
| 13 | **Gray** | `#444444` | `#777777` | `#999999` | `#CCCCCC` | Neutral, inactive, archived |
| 14 | **Gray-Blue** | `#3D4A5A` | `#6B7A8F` | `#8B9AAF` | `#C1CBDB` | Reference, documentation |
| 15 | **Gray-Warm** | `#5A504A` | `#8B7E74` | `#A69A91` | `#D1C7BE` | Optional, low priority |

---

## Tag Category Index

### Core Categories (Essential)
1. **Column Workflow** - Pipeline stages (headerBar)
2. **Task Priority** - Urgency/importance (footerBar)
3. **Task Status** - Quality/state (card background)
4. **Row Organization** - Content grouping (left border)

### Extended Categories (Recommended)
5. **Content Type** - Format indicators (thin border)
6. **Complexity** - Difficulty/effort (headerBar stripe)
7. **Dependencies** - Relationships (icon/badge)
8. **Review Status** - Approval workflow (footerBar)
9. **Version** - Release/iteration (badge)
10. **Platform/Target** - Delivery context (badge)

### Specialized Categories (Optional)
11. **Learning Objectives** - Education-specific
12. **Testing Status** - QA workflow
13. **Impact Level** - Change magnitude
14. **Source/Origin** - Content provenance
15. **Licensing** - Usage rights

---

## CORE CATEGORIES

### 1. COLUMN WORKFLOW (Pipeline Stages)

**Style**: `headerBar` with label (24px height)
**Color**: Accessible variant
**Purpose**: Define where item is in production pipeline

#### Teaching Materials Flow

| Tag | Label | Color | Stage Description | Exit Criteria |
|-----|-------|-------|-------------------|---------------|
| `#ideas` | IDEAS | Purple `#332288` | Brainstorming, concept collection | Outline created |
| `#outline` | OUTLINE | Purple `#332288` | Structure planning | Learning objectives defined |
| `#draft` | DRAFT | Blue `#88CCEE` | Initial content creation | First complete version |
| `#review` | REVIEW | Yellow `#DDCC77` | Peer/expert review | Feedback incorporated |
| `#polish` | POLISH | Cyan `#44AA99` | Refinement, editing | Quality standards met |
| `#ready` | READY | Green `#117733` | Approved, ready to use | Signed off |
| `#published` | PUBLISHED | Lime `#88CC44` | Live, being delivered | In active use |
| `#archived` | ARCHIVED | Gray `#777777` | Historical, superseded | Replaced or obsolete |

#### Product Development Flow

| Tag | Label | Color | Stage Description | Exit Criteria |
|-----|-------|-------|-------------------|---------------|
| `#backlog` | BACKLOG | Gray-Blue `#6B7A8F` | Not started, future work | Prioritized |
| `#planned` | PLANNED | Purple `#332288` | Designed, scheduled | Sprint assigned |
| `#active` | ACTIVE | Blue `#88CCEE` | In development | Code complete |
| `#code-review` | CODE REVIEW | Yellow `#DDCC77` | Peer review in progress | Approved |
| `#testing` | TESTING | Orange `#FFAA00` | QA, bug fixing | Tests pass |
| `#staging` | STAGING | Cyan `#44AA99` | Pre-release validation | Stakeholder approval |
| `#production` | PRODUCTION | Green `#117733` | Live, deployed | Monitoring stable |
| `#deprecated` | DEPRECATED | Gray `#777777` | End-of-life | Migration complete |

**Best Practices**:
- One workflow tag per column
- Move cards left-to-right through pipeline
- Define clear exit criteria for each stage
- Use archived/deprecated for historical reference

---

### 2. TASK PRIORITY (Urgency/Importance)

**Style**: `footerBar` with label (20px height)
**Color**: Accessible variant
**Purpose**: Indicate task urgency and importance

| Tag | Label | Color | When to Use | SLA / Timeframe |
|-----|-------|-------|-------------|-----------------|
| `#critical` | CRITICAL | Red `#CC3311` | Blocker, must do immediately | Today |
| `#high` | HIGH | Red-Orange `#EE7733` | Important, needed soon | This week |
| `#medium` | MEDIUM | Blue `#88CCEE` | Standard priority | This sprint/month |
| `#low` | LOW | Cyan `#44AA99` | Nice to have, not urgent | Next quarter |
| `#optional` | OPTIONAL | Gray `#777777` | Future consideration | Someday/maybe |

**Decision Matrix**:
```
Impact vs Urgency:
                High Impact    Low Impact
High Urgency    #critical      #high
Low Urgency     #medium        #low
```

**Best Practices**:
- Limit #critical items (max 2-3 active)
- Review priorities weekly
- #optional items can be archived if not actioned in 90 days
- Combine with dependencies to show blockers

---

### 3. TASK STATUS (Quality/State)

**Style**: `card` background (medium variant) with white/black text
**Purpose**: Describe individual item state and quality

#### For Teaching Materials

| Tag | Color (Medium) | Text | Description | Next Actions |
|-----|----------------|------|-------------|--------------|
| `#needswork` | Red-Orange `#F19557` | White | Requires significant improvement | Review feedback, revise |
| `#incomplete` | Yellow `#E5D889` | Black | Missing content or sections | Complete missing parts |
| `#complete` | Green `#159F44` | White | Fully developed, comprehensive | Review or use |
| `#outdated` | Orange `#FFB933` | Black | Content needs updating | Research updates, revise |
| `#verified` | Cyan `#5DCCBB` | White | Peer-reviewed, quality checked | Ready for final approval |
| `#tested` | Lime `#A0D95B` | Black | Tried with students, validated | Analyze results |
| `#unused` | Gray `#999999` | Black | Created but never used | Evaluate, archive, or improve |

#### For Product Development

| Tag | Color (Medium) | Text | Description | Next Actions |
|-----|----------------|------|-------------|--------------|
| `#blocked` | Red `#DD5533` | White | Cannot proceed, dependency | Resolve blocker |
| `#wip` | Yellow `#E5D889` | Black | Work in progress | Continue development |
| `#done` | Green `#159F44` | White | Task completed | Deploy or integrate |
| `#bug` | Pink `#D98594` | White | Defect, has issues | Debug and fix |
| `#feature` | Blue `#5BA3D0` | White | New functionality | Implement |
| `#refactor` | Magenta `#C066B3` | White | Code improvement, no new features | Refactor code |
| `#tech-debt` | Gray-Warm `#A69A91` | Black | Technical debt item | Prioritize and address |
| `#hotfix` | Red `#DD5533` | White | Urgent production fix | Fix and deploy immediately |

**Best Practices**:
- One status tag per card
- Update status as work progresses
- #blocked items should have dependency tags
- Review #unused and #outdated monthly

---

### 4. ROW ORGANIZATION (Content Grouping)

**Style**: `border` left side (4px solid, accessible variant)
**Purpose**: Organize content into thematic sections or product areas

#### Teaching Materials Organization

| Tag | Border Color | Description | Typical Contents |
|-----|-------------|-------------|------------------|
| `#intro` | Blue `#88CCEE` | Introduction, prerequisites | Overview slides, syllabus |
| `#basics` | Cyan `#44AA99` | Fundamental concepts | Core principles, definitions |
| `#core` | Purple `#332288` | Primary curriculum content | Main learning objectives |
| `#advanced` | Magenta `#AA4499` | Complex, optional topics | Deep dives, edge cases |
| `#practice` | Orange `#FFAA00` | Exercises and activities | Hands-on practice |
| `#assessment` | Red-Orange `#EE7733` | Quizzes, tests, evaluations | Assessment materials |
| `#resources` | Gray `#777777` | Supporting materials | References, links, tools |
| `#supplemental` | Gray-Warm `#8B7E74` | Optional extras | Bonus content |

#### Product Development Organization

| Tag | Border Color | Description | Typical Contents |
|-----|-------------|-------------|------------------|
| `#frontend` | Blue `#88CCEE` | UI/UX features | Interface components |
| `#backend` | Cyan `#44AA99` | Server-side logic | APIs, services, database |
| `#infrastructure` | Purple `#332288` | DevOps, deployment | CI/CD, servers, monitoring |
| `#security` | Red `#CC3311` | Security features | Auth, encryption, audits |
| `#performance` | Orange `#FFAA00` | Optimization work | Speed, efficiency |
| `#bugs` | Pink `#CC6677` | Bug fixes | Defect resolution |
| `#documentation` | Gray-Blue `#6B7A8F` | Docs and guides | Technical writing |
| `#research` | Purple-Dark `#882255` | R&D, experiments | Proof of concepts |

**Best Practices**:
- Use row tags to group related columns
- One row tag per column
- Combine with #row[N] for multi-row layouts
- Color-code rows for quick visual scanning

---

## EXTENDED CATEGORIES

### 5. CONTENT TYPE (Format Indicators)

**Style**: `border` on card (2px solid, accessible variant)
**Purpose**: Indicate content format or delivery method

#### Teaching Materials Types

| Tag | Border Color | Icon | Description |
|-----|-------------|------|-------------|
| `#slide` | Blue `#88CCEE` | 📊 | Presentation slide |
| `#video` | Purple `#332288` | 🎥 | Video content |
| `#reading` | Green `#117733` | 📖 | Text material, article |
| `#exercise` | Orange `#FFAA00` | ✏️ | Practice activity |
| `#quiz` | Red-Orange `#EE7733` | ❓ | Assessment question |
| `#demo` | Cyan `#44AA99` | 🔬 | Live demonstration |
| `#interactive` | Magenta `#AA4499` | 🎮 | Interactive element |
| `#handout` | Gray-Blue `#6B7A8F` | 📄 | Printable material |
| `#discussion` | Yellow `#DDCC77` | 💬 | Discussion prompt |

#### Product Development Types

| Tag | Border Color | Icon | Description |
|-----|-------------|------|-------------|
| `#epic` | Purple `#332288` | 🎯 | Large feature set |
| `#story` | Blue `#88CCEE` | 📝 | User story |
| `#task` | Cyan `#44AA99` | ✓ | Technical task |
| `#spike` | Purple-Dark `#882255` | 🔍 | Research task |
| `#chore` | Gray `#777777` | 🔧 | Maintenance work |
| `#improvement` | Green `#117733` | ⬆️ | Enhancement |
| `#design` | Magenta `#AA4499` | 🎨 | Design work |
| `#infrastructure` | Gray-Blue `#6B7A8F` | 🏗️ | DevOps task |

---

### 6. COMPLEXITY/DIFFICULTY LEVEL

**Style**: `headerBar` stripe (6px, no label, dark variant)
**Purpose**: Indicate complexity or prerequisite knowledge

| Tag | Stripe Color | Description | Prerequisites | Estimated Effort |
|-----|-------------|-------------|---------------|------------------|
| `#trivial` | Green `#0A4A1F` | Very simple, routine | None | < 1 hour |
| `#beginner` | Lime `#5A7D2E` | Entry level, basic | Fundamentals | 1-4 hours |
| `#intermediate` | Yellow `#968757` | Some experience needed | Multiple concepts | 1-2 days |
| `#advanced` | Orange `#B37700` | Complex, expert knowledge | Deep understanding | 1 week |
| `#expert` | Red `#881F0A` | Cutting edge, research | Mastery | 2+ weeks |

**Usage**:
- Teaching: Student skill level required
- Product: Technical complexity
- Helps with assignment and time estimation

---

### 7. DEPENDENCIES & RELATIONSHIPS

**Style**: Text indicators in description or tags
**Purpose**: Show what blocks or requires what

| Tag | Description | Visual | Usage |
|-----|-------------|--------|-------|
| `#requires-ID` | Needs another task first | ⬅️ | This requires task ID |
| `#blocks-ID` | Blocks another task | ➡️ | This blocks task ID |
| `#related-ID` | Related to another task | 🔗 | This relates to task ID |
| `#parent-ID` | Child of parent task | ⬆️ | This is subtask of ID |
| `#subtask` | Has subtasks | ⬇️ | This has children |
| `#duplicate` | Duplicate of another | ♻️ | Same as another task |
| `#supersedes-ID` | Replaces older task | 🔄 | This replaces ID |

**Best Practices**:
- Use task IDs for reference
- Track blockers with #blocked status + #requires-ID
- Review dependencies weekly
- Visualize critical paths

---

### 8. REVIEW & APPROVAL STATUS

**Style**: `footerBar` thin stripe (3px, no label)
**Purpose**: Track review/approval workflow

| Tag | Stripe Color | Description | Who Reviews | Next Step |
|-----|-------------|-------------|-------------|-----------|
| `#needs-review` | Orange `#FFAA00` | Awaiting review | Any reviewer | Assign reviewer |
| `#in-review` | Yellow `#DDCC77` | Review in progress | Assigned reviewer | Complete review |
| `#needs-changes` | Red-Orange `#EE7733` | Changes requested | Original author | Address feedback |
| `#reviewed` | Cyan `#44AA99` | Review complete | N/A | Move forward |
| `#needs-approval` | Magenta `#AA4499` | Awaiting approval | Approver | Get approval |
| `#approved` | Green `#117733` | Approved | N/A | Implement/publish |
| `#rejected` | Red `#CC3311` | Rejected | N/A | Revise or archive |

**Review Types**:
- Teaching: Peer review, expert review, instructional design review
- Product: Code review, design review, security review, QA review

---

### 9. VERSION & RELEASE

**Style**: Badge/label in title
**Purpose**: Track iterations and releases

| Tag | Description | Usage Context |
|-----|-------------|---------------|
| `#v1`, `#v2`, `#v3` | Version number | Major versions |
| `#v1.0`, `#v1.1` | Minor version | Incremental updates |
| `#alpha` | Alpha release | Internal testing |
| `#beta` | Beta release | Limited release |
| `#rc` | Release candidate | Pre-release |
| `#stable` | Stable release | Production ready |
| `#legacy` | Old version | Maintained but superseded |

---

### 10. PLATFORM & TARGET

**Style**: Small badge in card
**Purpose**: Indicate delivery platform or target audience

#### Teaching Materials Targets

| Tag | Description | Icon |
|-----|-------------|------|
| `#online` | Online delivery | 🌐 |
| `#in-person` | Classroom delivery | 🏫 |
| `#hybrid` | Mixed mode | 🔀 |
| `#async` | Self-paced | ⏰ |
| `#sync` | Live, synchronous | 🔴 |
| `#k12` | K-12 education | 🎒 |
| `#higher-ed` | University level | 🎓 |
| `#professional` | Professional development | 💼 |

#### Product Development Platforms

| Tag | Description | Icon |
|-----|-------------|------|
| `#web` | Web platform | 🌐 |
| `#mobile` | Mobile apps | 📱 |
| `#ios` | iOS specific | 🍎 |
| `#android` | Android specific | 🤖 |
| `#desktop` | Desktop apps | 💻 |
| `#api` | API/backend | 🔌 |
| `#all-platforms` | Cross-platform | ⭐ |

---

## SPECIALIZED CATEGORIES

### 11. LEARNING OBJECTIVES (Education-Specific)

**Purpose**: Align content with learning goals

| Tag | Description | Bloom's Taxonomy Level |
|-----|-------------|----------------------|
| `#remember` | Recall information | Knowledge |
| `#understand` | Explain concepts | Comprehension |
| `#apply` | Use in new situations | Application |
| `#analyze` | Break down and examine | Analysis |
| `#evaluate` | Make judgments | Evaluation |
| `#create` | Produce something new | Synthesis |

---

### 12. TESTING STATUS (QA Workflow)

**Purpose**: Track testing progress

| Tag | Description | Stage |
|-----|-------------|-------|
| `#untested` | No testing done | Pre-QA |
| `#unit-tested` | Unit tests pass | Development |
| `#integration-tested` | Integration tests pass | QA |
| `#e2e-tested` | End-to-end tests pass | QA |
| `#regression-tested` | Regression tests pass | QA |
| `#performance-tested` | Performance validated | QA |
| `#security-tested` | Security audit complete | Security |
| `#uat-passed` | User acceptance testing passed | Pre-release |

---

### 13. IMPACT LEVEL (Change Magnitude)

**Purpose**: Indicate scope of change

| Tag | Color | Description | Examples |
|-----|-------|-------------|----------|
| `#minor` | Green `#88CC44` | Small, low risk | Typo fix, style tweak |
| `#moderate` | Yellow `#DDCC77` | Medium scope | New feature, content update |
| `#major` | Orange `#FFAA00` | Large scope | Major redesign |
| `#breaking` | Red `#CC3311` | Breaking changes | API changes, migrations |

---

### 14. SOURCE & ORIGIN

**Purpose**: Track content provenance

| Tag | Description | Attribution Needed |
|-----|-------------|-------------------|
| `#original` | Created from scratch | No |
| `#adapted` | Modified from source | Yes |
| `#imported` | Used as-is from source | Yes |
| `#commissioned` | Created by contractor | Per contract |
| `#community` | Community contributed | Per license |

---

### 15. LICENSING & RIGHTS

**Purpose**: Track usage rights and restrictions

| Tag | Description | Can Modify | Can Share | Commercial Use |
|-----|-------------|-----------|-----------|----------------|
| `#cc-by` | Creative Commons Attribution | Yes | Yes | Yes |
| `#cc-by-sa` | CC Attribution-ShareAlike | Yes | Yes | Yes |
| `#cc-by-nc` | CC Attribution-NonCommercial | Yes | Yes | No |
| `#public-domain` | Public domain | Yes | Yes | Yes |
| `#proprietary` | All rights reserved | No | No | No |
| `#internal-only` | Organization internal | Per policy | No | No |

---

## WORKFLOW-SPECIFIC BEST PRACTICES

### Teaching Materials Development Workflow

#### Phase 1: Planning & Design
```markdown
## Curriculum Planning #intro #ideas

- [ ] Course outline #high #incomplete #beginner @instructor-alice @2024-12-31
  - Learning objectives: #understand #apply
  - Duration: #medium-time
  - Platform: #online #async
- [ ] Prerequisites identification #medium #complete #beginner
```

#### Phase 2: Content Creation
```markdown
## React Fundamentals #core #draft

- [ ] What is React? #high #needswork #slide #beginner #v1.0
  - #requires-outline #online
- [ ] JSX Basics #medium #complete #video #intermediate #v1.0
  - #tested #reviewed
- [ ] Props vs State #high #verified #slide #intermediate #v1.0
  - #approved @expert-bob
```

#### Phase 3: Review & Quality Assurance
```markdown
## Advanced Patterns #advanced #review

- [ ] Custom Hooks #critical #in-review #slide #expert #v2.0
  - #needs-changes @reviewer-carol
  - #requires-jsx-basics
- [ ] Performance Optimization #high #reviewed #demo #advanced
  - #approved #tested
```

#### Phase 4: Deployment & Iteration
```markdown
## React Basics #basics #published

- [ ] Component Lifecycle #medium #complete #video #intermediate #v1.1
  - #stable #uat-passed
  - Used in 5 courses
- [ ] Class Components #low #outdated #slide #intermediate #v1.0 #legacy
  - #supersedes-functional-components
  - Needs update for hooks
```

**Key Practices**:
1. Use #row tags to separate course modules
2. Track prerequisites with #requires-ID
3. Version content for curriculum updates
4. Mark tested content with student feedback
5. Archive outdated content, don't delete
6. Use #intermediate, #advanced for student levels
7. Link learning objectives to content

---

### Product Development Workflow

#### Sprint Planning
```markdown
## Sprint 12 Planning #backlog #planned

- [ ] User Authentication Refactor #high #feature #backend #epic @dev-team @2024-03-15
  - Story points: 8
  - #requires-api-redesign #breaking
- [ ] Dark Mode Support #medium #feature #frontend #web #mobile
  - Story points: 5
  - #v2.0
```

#### Active Development
```markdown
## Sprint 12 Active #active

- [ ] Login API Endpoint #critical #wip #feature #backend #api @alice
  - #unit-tested #in-review
  - #blocks-auth-ui
- [ ] OAuth Integration #high #blocked #feature #backend @bob
  - #requires-login-api
  - Waiting for API merge
- [ ] Dark Mode Toggle UI #medium #done #feature #frontend #web @carol
  - #code-review #approved
  - Ready to merge
```

#### Testing & QA
```markdown
## Sprint 12 QA #testing

- [ ] Login Flow E2E Tests #high #feature #all-platforms @qa-dave
  - #unit-tested #integration-tested #e2e-tested
  - #needs-approval
- [ ] Security Audit Auth System #critical #security #backend @security-team
  - #security-tested #needs-changes
  - Found XSS vulnerability
```

#### Release Management
```markdown
## Release 2.0 #staging

- [ ] Auth System Deploy #critical #feature #backend #production @devops-eve
  - #approved #stable #performance-tested
  - #v2.0 #breaking
  - Migration script ready
- [ ] Rollback Plan #high #documentation #infrastructure
  - #complete #reviewed
```

#### Bug Tracking
```markdown
## Bug Fixes #bugs #active

- [ ] Login timeout issue #critical #bug #hotfix #production @alice
  - Reported: @2024-03-01
  - #blocked #requires-logs
  - Affects 30% of users
- [ ] Dark mode flicker #medium #bug #frontend #web @carol
  - #wip #unit-tested
  - #moderate impact
```

#### Technical Debt
```markdown
## Tech Debt #tech-debt #backlog

- [ ] Refactor Auth Service #medium #refactor #backend
  - Accumulated since #v1.0
  - #major effort
- [ ] Update Test Suite #low #chore #all-platforms
  - #optional #minor
```

**Key Practices**:
1. Use #epic for large features, break into stories
2. Track blockers with #blocked + #requires-ID
3. Separate #hotfix from regular #bug fixes
4. Version features for release planning
5. Track impact level for prioritization
6. Use #platform tags for assignment
7. Link related tasks with #related-ID
8. Track testing stages explicitly
9. Separate #tech-debt from features
10. Use @date for deadlines, not in column titles

---

## TAG COMBINATION GUIDELINES

### Valid Combinations

**Column + Priority + Status** (Most Common):
```markdown
- [ ] Task name #draft #high #wip
```

**Column + Priority + Status + Type + Complexity**:
```markdown
- [ ] Advanced React Patterns #ready #medium #verified #slide #advanced
```

**With Dependencies and People**:
```markdown
- [ ] API Implementation #active #critical #wip #feature #requires-auth-design @alice @bob @2024-03-15
```

### Anti-Patterns (Avoid These)

❌ Multiple workflow tags:
```markdown
- [ ] Task #draft #review  # Confusing - which stage?
```

❌ Multiple priority tags:
```markdown
- [ ] Task #high #critical  # Contradictory
```

❌ Multiple status tags:
```markdown
- [ ] Task #complete #needswork  # Contradictory
```

✅ Correct approach:
```markdown
- [ ] Task #review #high #needswork  # Clear: in review, high priority, needs improvement
```

---

## COLOR USAGE REFERENCE CHART

### By Tag Category

| Category | Style | Color Variant | Contrast Requirement |
|----------|-------|---------------|---------------------|
| Column Workflow | headerBar | Accessible | White text |
| Task Priority | footerBar | Accessible | White text |
| Task Status | Card background | Medium | Tested for readability |
| Row Organization | Left border | Accessible | N/A |
| Content Type | Thin border | Accessible | N/A |
| Complexity | Header stripe | Dark | N/A |
| Review Status | Footer stripe | Medium/Light | N/A |

### Color Assignment Strategy

**High Attention** → Red, Red-Orange, Orange
- #critical, #blocked, #hotfix, #breaking, #expert

**Medium Attention** → Yellow, Pink
- #high, #review, #needs-changes, #bug, #intermediate

**Standard** → Blue, Cyan
- #active, #medium, #wip, #feature, #beginner

**Success/Complete** → Green, Lime
- #ready, #published, #approved, #done, #stable

**Planning/Special** → Purple, Magenta
- #ideas, #planned, #refactor, #advanced, #needs-approval

**Inactive/Low** → Grays
- #archived, #optional, #deprecated, #unused, #trivial

---

## IMPLEMENTATION CHECKLIST

### For Teaching Materials

- [ ] Define learning objectives for curriculum
- [ ] Choose row tags for course structure (#intro, #core, #advanced)
- [ ] Set up workflow columns (#ideas → #published)
- [ ] Add content type tags (#slide, #video, #exercise)
- [ ] Mark difficulty levels (#beginner, #intermediate, #advanced)
- [ ] Track review status (#needs-review, #approved)
- [ ] Version control important content (#v1.0, #v1.1)
- [ ] Use @instructor tags for assignment
- [ ] Add @date tags for deadlines
- [ ] Link prerequisites with #requires-ID

### For Product Development

- [ ] Set up agile workflow (#backlog → #production)
- [ ] Define row tags for product areas (#frontend, #backend)
- [ ] Add type tags (#epic, #story, #bug)
- [ ] Track testing status (#unit-tested, #e2e-tested)
- [ ] Use platform tags (#web, #mobile, #api)
- [ ] Mark breaking changes (#breaking, #major)
- [ ] Version features for releases (#v2.0)
- [ ] Track dependencies (#blocks-ID, #requires-ID)
- [ ] Use @dev tags for assignment
- [ ] Set sprint deadlines with @date

---

## FUTURE ENHANCEMENTS

### Automation Ideas
1. Auto-update status based on checklist completion
2. Auto-tag content type from file extension
3. Auto-calculate complexity from effort estimates
4. Dependency visualization graphs
5. Burndown charts by priority
6. Learning objective coverage reports

### Additional Features
1. Custom color themes per project
2. Tag templates for common workflows
3. Tag inheritance (parent → child tasks)
4. Tag search and filtering
5. Tag analytics and reports
6. Integration with calendars (@date)
7. Integration with user directory (@person)

---

## APPENDIX: Quick Reference

### Essential Tags for Quick Start

**Teaching Materials (Minimum Set)**:
- Workflow: `#draft`, `#review`, `#ready`, `#published`
- Priority: `#high`, `#medium`, `#low`
- Status: `#needswork`, `#complete`, `#verified`
- Type: `#slide`, `#exercise`, `#quiz`

**Product Development (Minimum Set)**:
- Workflow: `#backlog`, `#active`, `#testing`, `#production`
- Priority: `#critical`, `#high`, `#medium`
- Status: `#wip`, `#done`, `#blocked`
- Type: `#feature`, `#bug`, `#task`

### Tag Naming Conventions

- Use lowercase
- Use hyphens for multi-word tags (#code-review, not #codereview)
- Be specific but concise
- Avoid abbreviations unless standard (#uat, #api, #qa okay)
- Prefix with # for workflow tags
- Prefix with @ for people and dates

---

**Document Version**: 1.0
**Last Updated**: 2024
**Maintainer**: System Design Team
