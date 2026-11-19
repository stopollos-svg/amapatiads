# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Owner Integrity**: Every document in `apps`, `publisherSettings`, `mfaConfig`, `verificationLogs`, and `revenueSnapshots` MUST bind `ownerId == request.auth.uid` on creation and preserve `ownerId` immutably on update.
2. **Verified Email Gate**: All authenticated writes and private reads require `request.auth.token.email_verified == true`.
3. **Strict Path & Field Validation**: Document IDs must match `^[a-zA-Z0-9_-]+$` and `<= 128` chars. Strings enforce strict `.size()` bounds; arrays enforce `.size() <= MAX`.
4. **MFA Secret Isolation**: `mfaConfig/{userId}` forbids `list` queries and restricts `get`/`create`/`update` strictly to `userId == request.auth.uid`.
5. **Immutable Audit Logs**: `verificationLogs` documents are append-only (`update` and `delete` denied on client or restricted to owner delete only, no mutation of historical logs).
6. **Temporal Integrity**: `createdAt` equals `request.time` on creation and remains immutable on update; `updatedAt` equals `request.time` on creation and update.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: `POST /apps/app1` with `auth = null` -> DENIED.
2. **Owner Spoofing**: Authenticated as `uidA`, create `/apps/app1` with `ownerId: "uidB"` -> DENIED.
3. **Shadow Field Injection**: Create `/publisherSettings/uidA` with extra field `isAdmin: true` -> DENIED (`hasOnly` blocks).
4. **Unverified Email Write**: Authenticated with `email_verified: false`, write `/mfaConfig/uidA` -> DENIED.
5. **Cross-User MFA Read**: Authenticated as `uidB`, `get(/mfaConfig/uidA)` -> DENIED.
6. **MFA Collection Scrape**: Authenticated as `uidA`, `list(/mfaConfig)` -> DENIED.
7. **ID Poisoning**: Create `/apps/${'a'.repeat(500)}` -> DENIED (`isValidId` blocks).
8. **String Exhaustion**: Create `/apps/app1` with `description` of 5,000 chars -> DENIED (`.size() <= 320` blocks).
9. **Array Exhaustion**: Update `/publisherSettings/uidA` with 100 `appAdsLines` -> DENIED (`.size() <= 25` blocks).
10. **Immutable Field Tampering**: Update `/apps/app1` changing `createdAt` or `ownerId` -> DENIED.
11. **Timestamp Forgery**: Create `/verificationLogs/log1` with client `createdAt` != `request.time` -> DENIED.
12. **Blanket Private List**: Authenticated as `uidB`, `list(/verificationLogs)` without `where('ownerId', '==', 'uidB')` -> DENIED.
