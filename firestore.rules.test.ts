/**
 * Security Rules Verification Matrix (Payload-First TDD Reference)
 * Evaluates the 12 adversarial attack vectors documented in security_spec.md
 * against the Firestore collection constraints.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  expectedResult: 'PERMISSION_DENIED';
  reason: string;
}

export const DIRTY_DOZEN_AUDIT: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    collection: 'apps',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'isVerifiedUser() requires request.auth != null and email_verified == true.',
  },
  {
    id: 2,
    name: 'Owner Spoofing',
    collection: 'apps',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'isValidPublisherApp enforces data.ownerId == request.auth.uid.',
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: 'publisherSettings',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'data.keys().hasOnly(...) rejects unapproved fields such as isAdmin.',
  },
  {
    id: 4,
    name: 'Unverified Email Write',
    collection: 'mfaConfig',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'isOwner(userId) requires request.auth.token.email_verified == true.',
  },
  {
    id: 5,
    name: 'Cross-User MFA Read',
    collection: 'mfaConfig',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'allow get requires request.auth.uid == userId.',
  },
  {
    id: 6,
    name: 'MFA Collection Scrape',
    collection: 'mfaConfig',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'allow list: if false prevents listing MFA secrets.',
  },
  {
    id: 7,
    name: 'ID Poisoning',
    collection: 'apps',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'isValidId(appId) restricts document IDs to <= 128 safe characters.',
  },
  {
    id: 8,
    name: 'String Exhaustion',
    collection: 'apps',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'description.size() <= 320 rejects oversized payloads.',
  },
  {
    id: 9,
    name: 'Array Exhaustion',
    collection: 'publisherSettings',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'appAdsLines.size() <= 25 caps authorized seller lines.',
  },
  {
    id: 10,
    name: 'Immutable Field Tampering',
    collection: 'apps',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'affectedKeys().hasOnly(...) and incoming().ownerId == existing().ownerId block tampering.',
  },
  {
    id: 11,
    name: 'Timestamp Forgery',
    collection: 'verificationLogs',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'incoming().createdAt == request.time enforces server timestamp.',
  },
  {
    id: 12,
    name: 'Blanket Private List',
    collection: 'verificationLogs',
    expectedResult: 'PERMISSION_DENIED',
    reason: 'allow list checks resource.data.ownerId == request.auth.uid.',
  },
];
