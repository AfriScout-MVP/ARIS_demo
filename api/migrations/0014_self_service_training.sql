-- ARIS — the referee's self-service and the training register.
--   * every physical test is kept (fitness_test_history); fitness_tests stays the latest one per official
--   * courses get dates, a soft close and open self-enrolment; each enrolment carries its own state and exam score
--   * a referee may comment on / contest an assessment released to them, and file a defence on an open case


/* ------------------------------------------------------------------ *
 * Physical tests: the whole history. `fitness_tests` (one row per official) is kept in step with the
 * most recent test so every existing reader (snapshot, reports, the retest job) keeps working unchanged.
 * ------------------------------------------------------------------ */

CREATE TABLE fitness_test_history (
  id            TEXT PRIMARY KEY,
  official_id   TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  test1_result  TEXT NOT NULL CHECK (test1_result IN ('passed', 'failed')),
  best_sprint   REAL NOT NULL,
  test2_result  TEXT NOT NULL CHECK (test2_result IN ('passed', 'failed')),
  laps          INTEGER NOT NULL,
  retest_date   TEXT,
  recorded_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  recorded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_fitness_history_official ON fitness_test_history (official_id, date);

-- the tests on file so far become the first entry of each history
INSERT INTO fitness_test_history (id, official_id, date, test1_result, best_sprint, test2_result, laps, retest_date)
  SELECT 'fit-' || official_id || '-' || date, official_id, date, test1_result, best_sprint, test2_result, laps, retest_date FROM fitness_tests;


/* ------------------------------------------------------------------ *
 * Courses: dates, soft close, open enrolment. `courses.state` stays readable (and maintained) for older
 * clients; the state that matters is now the enrolment's own.
 * ------------------------------------------------------------------ */

ALTER TABLE courses ADD COLUMN starts_on TEXT;
ALTER TABLE courses ADD COLUMN ends_on TEXT;
-- referees of the course's federation (or anyone, platform-wide) may enrol themselves while it is open
ALTER TABLE courses ADD COLUMN open_enrolment INTEGER NOT NULL DEFAULT 0 CHECK (open_enrolment IN (0, 1));
-- a course with enrolments is never deleted: it is closed, and its history stays
ALTER TABLE courses ADD COLUMN closed_at TEXT;

ALTER TABLE course_enrolments ADD COLUMN state TEXT NOT NULL DEFAULT 'enrolled' CHECK (state IN ('enrolled', 'completed', 'failed'));
ALTER TABLE course_enrolments ADD COLUMN exam_score REAL CHECK (exam_score IS NULL OR (exam_score >= 0 AND exam_score <= 100));
ALTER TABLE course_enrolments ADD COLUMN enrolled_at TEXT;
ALTER TABLE course_enrolments ADD COLUMN self_enrolled INTEGER NOT NULL DEFAULT 0 CHECK (self_enrolled IN (0, 1));

UPDATE course_enrolments SET state = 'completed' WHERE completed_at IS NOT NULL;


/* ------------------------------------------------------------------ *
 * The assessed referee's voice on a released report, and the federation's answer.
 * ------------------------------------------------------------------ */

CREATE TABLE assessment_comments (
  id             TEXT PRIMARY KEY,
  assessment_id  TEXT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  author_role    TEXT NOT NULL CHECK (author_role IN ('admin', 'federation', 'referee')),
  -- comment / contest: the referee; response: staff
  kind           TEXT NOT NULL CHECK (kind IN ('comment', 'contest', 'response')),
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind = 'response') = (author_role <> 'referee'))
);
CREATE INDEX idx_assessment_comments ON assessment_comments (assessment_id, created_at);


/* ------------------------------------------------------------------ *
 * The official's written defence on a case concerning them, filed before the decision.
 * ------------------------------------------------------------------ */

CREATE TABLE case_defences (
  case_id     TEXT PRIMARY KEY REFERENCES disciplinary_cases (id) ON DELETE CASCADE,
  statement   TEXT NOT NULL,
  filed_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  filed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
