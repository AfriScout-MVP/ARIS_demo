// A two-country world with a bit of everything in it, so the snapshot's scoping can be checked table by table.
import { addCompetition, addCountry, addFederationSeat, addFixture, addOfficial, addTeam, addUser, login, sql, type Session } from "../helpers";

export interface SnapshotWorld {
  admin: Session;
  egy: Session;
  mar: Session;
  referee: Session;
  egyFed: string;
  marFed: string;
}

export const D = "2031-06-10"; // inside the default window of a fixed `from`/`to` we pass in the tests

async function country(code: string, tz: string) {
  await addCountry(code, { timezone: tz });
  await addCompetition(`${code.toLowerCase()}-d1`, code);
  await addOfficial(`${code}-ref`, code);
  await addOfficial(`${code}-obs`, code);
  await addOfficial(`${code}-ast`, code, { kind: "assistant" });
  const home = await addTeam(`${code} Home`, code);
  const away = await addTeam(`${code} Away`, code);
  const fx = `fx-${code}`;
  await addFixture(fx, { country: code, competition: `${code.toLowerCase()}-d1`, date: D, home: `${code} Home`, away: `${code} Away` });
  // a played match with officiating analytics and two decisions
  const m = `m-${code}`;
  await sql("INSERT INTO matches (id, league_id, season, home_team_id, away_team_id, match_date, home_score, away_score, status, referee_id, fixture_id) VALUES (?, ?, '2026/2027', ?, ?, '2031-06-01T18:00:00Z', 2, 1, 'finished', ?, NULL)", m, `${code.toLowerCase()}-d1`, home, away, `${code}-ref`).run();
  await sql("INSERT INTO match_officiating (match_id, arps_for_match, rmcs, pressure_avg, heat_points) VALUES (?, 8.2, 8.0, 40, '[{\"x\":10,\"y\":20,\"intensity\":0.5}]')", m).run();
  for (const [i, call, review, final] of [[1, "given", 0, "confirmed"], [2, "given", 1, "confirmed"], [3, "not-given", 1, "overturned"]] as const) {
    await sql("INSERT INTO match_decisions (id, match_id, minute, type, sub_event, description, initial_call, var_review, final_call, confidence, pressure_index, distance) VALUES (?, ?, ?, 'foul_advantage', 'foul_given', '{\"en\":\"x\",\"fr\":\"x\"}', ?, ?, ?, 0.9, 1, 10)", `${m}-d${i}`, m, i * 10, call, review, final).run();
  }
  await sql("INSERT INTO assessments (id, match_id, referee_id, observer_id, state, overall, marks, notes) VALUES (?, ?, ?, ?, 'filed', 8, '{}', '{\"en\":\"ok\",\"fr\":\"ok\"}')", `a-${code}`, m, `${code}-ref`, `${code}-obs`).run();
  await sql("INSERT INTO dossiers (id, match_id, generated, pages) VALUES (?, ?, '2031-06-02', 3)", `d-${code}`, m).run();
  await sql("INSERT INTO licences (id, official_id, kind, issued, expires) VALUES (?, ?, 'FIFA Badge', '2030-01-01', '2032-01-01')", `l-${code}`, `${code}-ref`).run();
  await sql("INSERT INTO fitness_tests (official_id, date, test1_result, best_sprint, test2_result, laps) VALUES (?, '2031-01-01', 'passed', 6.1, 'passed', 40)", `${code}-ref`).run();
  await sql("INSERT INTO availability (official_id, date, state, reason) VALUES (?, ?, 'unavailable', 'leave')", `${code}-ref`, D).run();
  await sql("INSERT INTO performance_history (month, country_code, avg_arps) VALUES ('2031-05', ?, ?)", code, code === "EGY" ? 7.5 : 6.5).run();
}

export async function snapshotWorld(): Promise<SnapshotWorld> {
  await country("EGY", "Africa/Cairo");
  await country("MAR", "Africa/Casablanca");
  const egy = await addFederationSeat("EGY");
  const mar = await addFederationSeat("MAR");
  await addCompetition("caf-cl", "CAF", { tier: "continental" });
  await addFixture("fx-CAF", { country: "CAF", competition: "caf-cl", date: D, home: "Al Ahly", away: "Raja", homeCode: "EGY", awayCode: "MAR" });
  await sql("INSERT INTO performance_history (month, country_code, avg_arps) VALUES ('2031-05', '', 7.0), ('2031-04', '', 6.8)").run();
  await sql("INSERT INTO evaluation_criteria (key, label, weight, sort) VALUES ('positioning', '{\"fr\":\"Placement\",\"en\":\"Positioning\"}', 60, 1), ('decisions', '{\"fr\":\"Décisions\",\"en\":\"Decisions\"}', 40, 2)").run();
  // courses: one platform-wide, one per federation; each with an enrolled referee
  await sql("INSERT INTO courses (id, kind, name, provider, federation_id, hours, state) VALUES ('c-all', 'course', '{\"fr\":\"A\",\"en\":\"A\"}', 'CAF', NULL, 10, 'enrolled'), ('c-EGY', 'course', '{\"fr\":\"B\",\"en\":\"B\"}', 'EFA', ?, 5, 'enrolled'), ('c-MAR', 'course', '{\"fr\":\"C\",\"en\":\"C\"}', 'FRMF', ?, 5, 'enrolled')", egy.federationId, mar.federationId).run();
  await sql("INSERT INTO course_enrolments (course_id, official_id) VALUES ('c-all', 'EGY-ref'), ('c-all', 'MAR-ref'), ('c-EGY', 'EGY-ref'), ('c-MAR', 'MAR-ref')").run();
  await addUser("admin@aris.test", "admin");
  await addUser("referee@aris.test", "referee", { officialId: "EGY-ref" });
  const [admin, egyS, marS, referee] = await Promise.all([login("admin@aris.test"), login(egy.email), login(mar.email), login("referee@aris.test")]);
  return { admin, egy: egyS, mar: marS, referee, egyFed: egy.federationId, marFed: mar.federationId };
}

export const WINDOW = "/snapshot?from=2031-01-01&to=2031-12-31";
