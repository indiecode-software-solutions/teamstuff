Absolutely. Here’s a **copy-paste-ready instruction for Antigravity/Lovable** to implement the attendance behavior without breaking your existing attendance system.

---

# Attendance Clock-In / Clock-Out & Geofence Logic

Implement a robust attendance system for the employee portal. The goal is to prevent incorrect working-hour calculations when employees forget to clock out, while still supporting legitimate overtime.

## 1. Clock-In

When an employee clicks **Clock In**:

1. Request the employee's current GPS location.
2. Verify the employee is within the company's configured attendance geofence.
3. If outside the permitted radius:
   - Do not create attendance.
   - Show a clear message such as:
     > "You are outside the permitted attendance location."
4. If inside the geofence:
   - Record the clock-in timestamp.
   - Record the latitude/longitude used for verification.
   - Set attendance status to `Working`.
   - Start the live working-hours counter.
5. Prevent duplicate clock-ins for the same working day.

Do not use simple login location as the attendance timestamp. **Clock-in must have its own location verification.**

---

# 2. Clock-Out

When the employee clicks **Clock Out**:

1. Request their current GPS location.
2. Verify they are within the permitted company geofence.
3. If outside the geofence:
   - Do not complete the clock-out.
   - Show:
     > "You must be within the permitted attendance location to clock out."
4. If valid:
   - Record clock-out timestamp.
   - Record clock-out latitude/longitude.
   - Calculate the final working duration.
   - Calculate regular hours and overtime according to the company's attendance policy.
   - Change attendance status to `Completed`.

The live timer must stop immediately after successful clock-out.

---

# 3. Scheduled Workday End

The system must **NOT automatically clock an employee out at the scheduled end time**.

Example:

```text
Shift: 9:00 AM – 6:00 PM

Employee clocks in: 9:05 AM
Employee is still working at 6:00 PM
```

At 6:00 PM, the system should recognize that the scheduled workday has ended, but **the employee remains clocked in**.

Do not automatically set their checkout to 6:00 PM because this would incorrectly eliminate legitimate overtime.

---

# 4. Shift-End Prompt

When the scheduled workday ends and the employee is still marked as working, display a prominent notification/modal:

> **Your scheduled workday has ended**
>
> You're still marked as working.
>
> Are you still working?

Buttons:

**I'm Done**  
**Continue Working**

### If "I'm Done"

Start the normal clock-out process and request GPS verification.

### If "Continue Working"

Keep the employee clocked in.

Change the UI to clearly show:

```text
Regular Hours: 08:00:00
Overtime: 00:17:42
```

The employee can continue working and later clock out normally.

---

# 5. Overtime

Overtime must **never be capped automatically at the scheduled shift end**.

Example:

```text
Shift: 9:00 AM – 6:00 PM
Clock-in: 9:00 AM
Clock-out: 8:00 PM
```

The system should record:

```text
Regular Hours: 8:00
Overtime: 2:00
Total: 10:00
```

Use the company's configured working-hours policy to determine regular hours.

Do not simply calculate overtime as unrestricted elapsed time.

---

# 6. Forgotten Clock-Out

This is extremely important.

If an employee clocks in but never clocks out, **do not allow the timer to continue indefinitely**.

For example:

```text
Clock-in: 9:00 AM
Scheduled end: 6:00 PM
No clock-out
```

At the scheduled end:

```text
Status: Checkout Pending
```

The system should NOT assume:

```text
9:00 AM → current time
```

is the employee's working duration.

Instead, after the configured unresolved-attendance window, freeze the attendance calculation and mark it:

> **Checkout Missing**

Example:

```text
Clock In:       09:00 AM
Clock Out:      Missing
Regular Hours:  08:00
Overtime:       Pending
Status:         Checkout Missing
```

The employee must then regularize the attendance.

---

# 7. Regularization for Missing Checkout

Use the existing attendance regularization mechanism.

Employee should be able to submit:

```text
Date
Actual Clock-Out Time
Reason
```

Example:

> Date: 14 Aug 2026  
> Clock-out: 6:47 PM  
> Reason: Forgot to clock out

The request goes through the existing approval workflow.

Until approved:

```text
Overtime: Pending
Status: Checkout Missing
```

After approval:

```text
Clock-out: 6:47 PM
Regular Hours: 8:00
Overtime: 0:47
Status: Completed
```

If rejected, apply the company's existing attendance policy.

Do not silently invent a checkout time.

---

# 8. Reminder System

Add reminders to reduce forgotten clock-outs.

### Before scheduled end

For example, 15 minutes before the scheduled end:

> **Your workday ends in 15 minutes.**
>
> Remember to clock out when you finish working.

### After scheduled end

If the employee remains clocked in:

> **You're still clocked in.**
>
> Are you still working?

Provide:

**Clock Out**  
**Continue Working**

The exact reminder timing should come from the company's attendance policy where possible rather than hardcoding it.

---

# 9. Attendance Statuses

Use clear internal states rather than only `Working` / `Completed`.

Recommended states:

```text
NOT_STARTED
WORKING
OVERTIME
COMPLETED
CHECKOUT_MISSING
REGULARIZATION_PENDING
REGULARIZATION_APPROVED
REGULARIZATION_REJECTED
```

The UI should translate these into user-friendly labels.

For example:

| Internal State | UI |
|---|---|
| `WORKING` | Working |
| `OVERTIME` | Overtime |
| `COMPLETED` | Completed |
| `CHECKOUT_MISSING` | Checkout Missing |
| `REGULARIZATION_PENDING` | Awaiting Approval |
| `REGULARIZATION_APPROVED` | Completed |

---

# 10. Live Timer

The live timer should behave differently depending on the state.

### WORKING

```text
Total Hours: 05:28:30
```

Continue counting.

### OVERTIME

Show:

```text
Regular: 08:00:00
Overtime: 00:28:30
Total: 08:28:30
```

### COMPLETED

Freeze the timer.

### CHECKOUT_MISSING

Do **not** continue displaying an unlimited timer.

Instead show:

```text
Regular Hours: 08:00:00
Overtime: Pending
Checkout: Missing
```

---

# 11. Geofence Rules

Use the company's configured:

```text
OFFICE_LAT
OFFICE_LNG
OFFICE_RADIUS_METERS
```

Use the existing distance calculation/geofence implementation if one already exists.

Do not duplicate geofence logic in multiple places.

Create/reuse one central attendance location validation function so that:

```text
Clock In
Clock Out
```

use the same geofence rules.

---

# 12. Security / Data Integrity

Do not trust values sent from the frontend for:

- working duration
- overtime
- clock-in time
- clock-out time
- geofence validity
- attendance status

The backend must be authoritative.

The frontend should only display the calculated results.

Record attendance events with timestamps and location verification information so HR/Admin can audit them later.

---

# 13. Important Existing-System Rule

**Do not redesign or replace the existing attendance system unnecessarily.**

First inspect the existing:

- attendance database/schema
- clock-in API
- clock-out API
- regularization system
- company attendance settings
- working-hours configuration
- admin attendance view
- employee attendance view

Then integrate this logic into the existing architecture.

Reuse existing components and APIs wherever possible.

Do not create duplicate attendance tables or parallel attendance logic.

---

# 14. Final Expected Behavior

The complete flow should be:

```text
                  CLOCK IN
                     ↓
              GPS / GEOFENCE
                     ↓
                  WORKING
                     ↓
             Scheduled End Time
                     ↓
             ┌───────┴────────┐
             ↓                ↓
          I'm Done       Continue Working
             ↓                ↓
       GPS / Clock Out      OVERTIME
             ↓                ↓
          COMPLETED       GPS / Clock Out
                              ↓
                           COMPLETED
```

If the employee does nothing:

```text
WORKING
   ↓
Scheduled End
   ↓
Still Working
   ↓
Checkout Missing
   ↓
Freeze Calculation
   ↓
Regularization Required
   ↓
Employee submits actual checkout
   ↓
Manager/HR approval
   ↓
Attendance Finalized
```

### Core principle

**Never guess an employee's checkout time.**

The system should either:

1. Receive a genuine clock-out,
2. Receive an explicitly confirmed overtime continuation followed by clock-out, or
3. Mark the attendance as requiring regularization.

This preserves **geofence integrity, accurate working hours, legitimate overtime, and protection against forgotten clock-outs** without creating artificial attendance data.