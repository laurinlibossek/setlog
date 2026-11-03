# Coaching notes

TrueTrain, the engine behind Increment Pro, turns the training log into notes. Each note comes from one rule of the training knowledge base and carries that rule's evidence grade. This section is how notes look and where they go.

## A note

- One sentence of finding, at most one of action. Numbers first. "Rest on barbell lifts was 58 s. Two to three minutes keeps more reps in the later sets."
- A grade mark in front (`CoachNote`): **A** filled `ink`, **B** outlined `ink`, **C** outlined `ink-2`. The weaker the evidence, the quieter the mark. Findings graded D stay in the knowledge base and never become notes. The legend lives in the Why sheet, not on screen.
- "Why" at the end opens a sheet with the finding behind the rule, its grade, the rule ID (P1, V1…) and the source. Coaching is never a black box.
- Notes are text in `ink` on `paper`. No cards, icons, colours, sparkles or "AI" labels. `signal` only if the note reports something that went up.
- Long-press (or ⋯ in the Why sheet): "Not now" hides it until the situation changes; "Don't show this kind" turns the rule off.

## Where notes appear

| Placement (engine id) | Surface | Limit |
| --- | --- | --- |
| `workoutStart` | Today, under the Up next card; the session header when it opens | 1 |
| `beforeExercise` | Session, under the exercise name (inline note) | 1 per exercise |
| `setRow` | The ghost values of the next set (the coach's target replaces last time's numbers) and the inline note's text | silent |
| `workoutSummary` | Summary → Notes | 2 |
| `weeklyReview` | Today → Notes on the first day of the week; Progress → Week | 3 |
| `exercisePage` | The exercise page, under the hero number | 1 |
| `templateEditor` | The routine editor, above the exercise list | 2 |
| `reviewScreen` | The block review at the end of a block | per muscle |
| `programSetup` | Build a split | inline |

- Never a modal, toast or notification for a coaching note. The person meets notes where they already look.
- Strongest grade first when several compete for one place.
- Without Pro, placements stay empty. Nothing is greyed out or teased; a single "Build a split" row on Plan carries the Pro chip.
