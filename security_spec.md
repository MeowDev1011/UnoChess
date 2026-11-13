# Security Specification: UnoChess Online Lobby & Matches

## 1. Data Invariants
1. **Player Profile Isolation & Identity**: A player document at `/players/{uid}` can only be created or updated by `request.auth.uid == uid`. It stores zero PII (no emails, phones, or addresses). Initial `elo` must be `1200`, `wins == 0`, `losses == 0`.
2. **Authentic Lobby Challenges**: Every document in `/challenges/{challengeId}` must have `creatorUid == request.auth.uid` on creation, `status == 'open'`, and `matchedMatchId == ''`. A player cannot accept their own challenge (`existing().creatorUid != request.auth.uid`). Accepting a challenge atomically requires `existsAfter(/databases/$(database)/documents/matches/$(incoming().matchedMatchId))`.
3. **Terminal State Locking**: Once a challenge reaches `'matched'` or `'cancelled'`, or a match reaches `'finished'`, no further mutations are permitted.
4. **Participant Isolation in Active Matches**: Only `hostUid` or `guestUid` can update an `'active'` match or read an `'active'`/`'finished'` match. Magic links in `'waiting'` status can be fetched by ID by a signed-in invitee only to join (`guestUid == request.auth.uid`).
5. **Server Timestamp Integrity**: `createdAt`, `updatedAt`, and `joinedAt` (on join) must strictly equal `request.time`.

## 2. Adversarial ("Dirty Dozen") Payloads Blocked by Rules
1. Unauthenticated read/write to `/players`, `/challenges`, `/matches` -> DENIED (`isSignedIn()`).
2. Creating `/players/otherUid` with `uid: 'otherUid'` -> DENIED (`uid == request.auth.uid`).
3. Creating `/players/myUid` with `elo: 2900` -> DENIED (`elo == 1200`).
4. Adding shadow field `isAdmin: true` to `/players/myUid` -> DENIED (`keys().hasOnly(...)`).
5. Creating a challenge impersonating another `creatorUid` -> DENIED (`creatorUid == request.auth.uid`).
6. Self-accepting own challenge -> DENIED (`existing().creatorUid != request.auth.uid`).
7. Accepting a challenge with a fake `matchedMatchId` that was not created in the batch -> DENIED (`existsAfter(...)`).
8. Updating a `'matched'` or `'cancelled'` challenge -> DENIED (`existing().status == 'open'`).
9. Non-participant updating an `'active'` match -> DENIED (`hostUid`/`guestUid` check).
10. Third party listing all active/finished matches -> DENIED (`allow list` requires `hostUid == uid || guestUid == uid`).
11. Modifying a `'finished'` match's `winnerUid` -> DENIED (`existing().status != 'finished'`).
12. Spoofing `createdAt` or `updatedAt` with client timestamps -> DENIED (`== request.time`).
