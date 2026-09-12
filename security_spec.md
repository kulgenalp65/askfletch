# Security Specification: Firebase User Account Management

## 1. Data Invariants
1. **User Identity Invariant**: A user document at `/users/{userId}` must only be written or created if `request.auth.uid == userId` or if the requester is an administrator (`isAdmin()`).
2. **Role Integrity Invariant**: Standard users (`agent`) cannot elevate their own role to `admin` or modify account status (`status`) upon creation or self-update. Only authenticated admins or the system can change `role` or `status`.
3. **Admin Directory Invariant**: The `/admins/{adminId}` collection defines trusted administrators. Bootstrapped admin email `kulgenalp@gmail.com` is permanently recognized when `request.auth.token.email_verified == true`.
4. **PII and Account Visibility**: A user may read their own `/users/{userId}` document. An administrator may read and list all user documents in `/users`.
5. **Default Deny**: All unspecified paths default to `read: false; write: false;`.

## 2. Dirty Dozen Negative Test Payloads
1. **Ghost Field Poisoning**: Inserting `__shadowAdmin: true` on user create.
2. **Role Escalation on Signup**: Setting `role: 'admin'` during self-registration.
3. **Privilege Tampering on Profile Update**: User submitting `{ role: 'admin' }` in `affectedKeys()`.
4. **Account Un-suspension**: A suspended user submitting `{ status: 'active' }`.
5. **ID Mismatch**: Attempting to write to `/users/other-user-uid` while authenticated as a different UID.
6. **Unauthenticated Read**: Attempting to query `/users` collection without authentication.
7. **Cross-User PII Read**: Regular agent attempting to read `/users/target-user-uid`.
8. **Admin Collection Tampering**: Non-admin user attempting to create `/admins/{uid}`.
9. **Invalid Email Injection**: User profile with malformed or 1MB string email.
10. **Created Timestamp Manipulation**: Modifying immutable `createdAt` field on update.
11. **Oversized String Attack**: Submitting 50KB name string to cause resource exhaustion.
12. **Unverified Email Impersonation**: Attacker presenting `kulgenalp@gmail.com` with `email_verified: false`.
