# Activity Log & RBAC Implementation Plan

> **Status:** Planned (not yet implemented)
> **Created:** 2026-01-11

## Overview

This document outlines the implementation plan for:
1. **Activity Log** - Track logbook creations, edits, comments, etc.
2. **RBAC (Role-Based Access Control)** - Captain, Mate, Crew roles with different permissions

---

## Database Design

### Recommendation: Single `User` table with role enum

**Why this approach:**
1. Avoids duplication - Captain/Mate/Crew share the same fields (name, email, avatar, etc.)
2. Easier queries - One table to query for any user type
3. Extensible - Easy to add roles later (e.g., MANAGER, ADMIN)
4. Standard RBAC pattern - Industry best practice
5. Links to existing Crew - A User with role=CREW can optionally link to the `Crew` table for scheduling data

---

## New Database Tables

Add to `apps/api/prisma/schema.prisma`:

```prisma
// User for authentication & RBAC
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatarUrl String?
  role      UserRole @default(CREW)

  // Optional link to Crew (for crew members with shift data)
  crewId    String?  @db.Char(7)
  crew      Crew?    @relation(fields: [crewId], references: [id])

  storeId   Int
  store     Store    @relation(fields: [storeId], references: [id])

  activities ActivityLog[]
  comments   Comment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum UserRole {
  CAPTAIN   // Full access
  MATE      // Can create/edit logbooks, view reports
  CREW      // Preferences + personal info only
}

// Activity log for tracking events
model ActivityLog {
  id         String       @id @default(cuid())
  type       ActivityType

  userId     String
  user       User         @relation(fields: [userId], references: [id])

  logbookId  Int?
  logbook    Logbook?     @relation(fields: [logbookId], references: [id])

  storeId    Int
  store      Store        @relation(fields: [storeId], references: [id])

  metadata   Json?        // Extra context (e.g., what changed)
  createdAt  DateTime     @default(now())
}

enum ActivityType {
  LOGBOOK_CREATED
  LOGBOOK_EDITED
  LOGBOOK_PUBLISHED
  LOGBOOK_SUPERSEDED
  LOGBOOK_VIEWED
  COMMENT_ADDED
}

// Comments on logbooks
model Comment {
  id        String   @id @default(cuid())
  content   String
  mood      String?  // Optional: excited, happy, etc.

  userId    String
  user      User     @relation(fields: [userId], references: [id])

  logbookId Int
  logbook   Logbook  @relation(fields: [logbookId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Don't forget to add relations to existing models:**

```prisma
// Add to Logbook model
model Logbook {
  // ... existing fields
  activities ActivityLog[]
  comments   Comment[]
}

// Add to Store model
model Store {
  // ... existing fields
  users      User[]
  activities ActivityLog[]
}

// Add to Crew model
model Crew {
  // ... existing fields
  user       User?
}
```

---

## Permission Matrix

| Action | Captain | Mate | Crew |
|--------|---------|------|------|
| Create/Edit Logbooks | ✅ | ✅ | ❌ |
| Publish Logbooks | ✅ | ✅ | ❌ |
| View All Logbooks | ✅ | ✅ | ❌ |
| View Activity Log | ✅ | ✅ | ❌ |
| Add Comments | ✅ | ✅ | ❌ |
| Manage Crew | ✅ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ |
| Edit Own Preferences | ✅ | ✅ | ✅ |
| Edit Own Info | ✅ | ✅ | ✅ |

---

## API Endpoints

### User Management
```
POST   /users                    - Create user (Captain only)
GET    /users                    - List users (Captain/Mate)
GET    /users/:id                - Get user by ID
PATCH  /users/:id                - Update user
PATCH  /users/:id/role           - Change role (Captain only)
DELETE /users/:id                - Delete user (Captain only)
```

### Activity Log
```
GET    /activity                 - Get activity feed
       ?storeId=                 - Filter by store (required)
       ?logbookId=               - Filter by logbook (optional)
       ?type=                    - Filter by activity type (optional)
       ?limit=                   - Pagination limit (default: 50)
       ?cursor=                  - Pagination cursor
```

### Comments
```
POST   /comments                 - Add comment to logbook
       Body: { logbookId, content, mood? }

GET    /comments                 - Get comments
       ?logbookId=               - Filter by logbook (required)

PATCH  /comments/:id             - Edit comment (own comments only)
DELETE /comments/:id             - Delete comment (own or Captain)
```

---

## Implementation Steps

### Phase 1: Database Setup
1. Add new models to Prisma schema
2. Add relations to existing models (Logbook, Store, Crew)
3. Run migration: `pnpm db:push` or create proper migration
4. Generate Prisma client: `pnpm db:generate`

### Phase 2: API - User Management
1. Create `/routes/users.ts` with CRUD endpoints
2. Add role-based middleware for permission checks
3. Add tests for user management

### Phase 3: API - Activity Log
1. Create `/routes/activity.ts` endpoint
2. Create `/services/activity-logger.ts` service
3. Update `logbook-manager.ts` to auto-log activities:
   - On logbook create → LOGBOOK_CREATED
   - On logbook edit → LOGBOOK_EDITED
   - On logbook publish → LOGBOOK_PUBLISHED
   - On logbook supersede → LOGBOOK_SUPERSEDED
4. Add tests for activity logging

### Phase 4: API - Comments
1. Create `/routes/comments.ts` with CRUD endpoints
2. Auto-create COMMENT_ADDED activity on new comment
3. Add tests for comments

### Phase 5: Frontend - Activity Feed Component
1. Create `ActivityFeed.tsx` component (adapt from Tailwind UI template)
2. Create `CommentForm.tsx` component
3. Add React Query hooks for activity/comments
4. Integrate into logbook detail view

### Phase 6: Frontend - RBAC Integration
1. Add auth context with user role
2. Create permission hooks: `useCanEdit()`, `useCanManage()`, etc.
3. Conditionally render UI based on permissions
4. Add role management UI for Captains

---

## Activity Types Reference

| Type | Triggered By | Metadata |
|------|--------------|----------|
| `LOGBOOK_CREATED` | Creating a new logbook | `{ date, status }` |
| `LOGBOOK_EDITED` | Editing assignments | `{ changesCount }` |
| `LOGBOOK_PUBLISHED` | Publishing a draft | `{ previousStatus }` |
| `LOGBOOK_SUPERSEDED` | New logbook replaces old | `{ supersededById }` |
| `LOGBOOK_VIEWED` | Viewing logbook detail | `{}` |
| `COMMENT_ADDED` | Adding a comment | `{ commentId }` |

---

## Mood Options (for Comments)

```typescript
const moods = [
  { name: 'Excited', value: 'excited', icon: FireIcon, color: 'red' },
  { name: 'Loved', value: 'loved', icon: HeartIcon, color: 'pink' },
  { name: 'Happy', value: 'happy', icon: FaceSmileIcon, color: 'green' },
  { name: 'Sad', value: 'sad', icon: FaceFrownIcon, color: 'yellow' },
  { name: 'Thumbsy', value: 'thumbsy', icon: HandThumbUpIcon, color: 'blue' },
];
```

---

## UI Reference

The activity feed UI should be adapted from the Tailwind UI "Invoice with Activity Feed" template. Key features:
- Timeline with connecting vertical line
- Different display for comments vs. system events
- User avatars
- Relative timestamps ("3d ago")
- Comment form with mood selector
- Optional file attachments (future)

---

## Notes

- Crew access is very limited: only preferences and personal info
- User table is separate from Crew table - User is for auth/RBAC, Crew is for scheduling
- A User with role=CREW can optionally link to a Crew record via `crewId`
- Activity logs are immutable (no updates/deletes)
- Comments can be edited/deleted by owner or Captain
