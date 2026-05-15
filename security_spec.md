# Security Spec

## Data Invariants
1. A `QuizHistory` record must belong to the user creating it (`resource.data.userId == request.auth.uid`).
2. The user can only create records with their own `userId`.
3. The user can only read their own quiz history.
4. The `createdAt` must be `request.time`.
5. Quiz histories cannot be updated or deleted by normal users, only created and read.
6. The user must be authenticated.
7. Payload string fields must have size constraints.

## The "Dirty Dozen" Payloads
1. `{"kelas": "7"}` (Missing required fields)
2. `{"userId": "attacker", "kelas": "7", ...}` (Spoofing another user's ID)
3. `{"userId": "myId", "kelas": "7", "content": <1.5MBstring>}` (Resource Exhaustion)
4. `{"userId": "myId", "kelas": "7", "createdAt": "fakeTime"}` (Client timestamp instead of request.time)
5. `{"userId": "myId", "kelas": "7", "ghostField": true}` (Shadow update / ghost field)
6. `{"userId": "myId", "kelas": 7}` (Type mismatch, kelas is number instead of string)

## The Test Runner
Tests will assert PERMISSION_DENIED for the above payloads.
