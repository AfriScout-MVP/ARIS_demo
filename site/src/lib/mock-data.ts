// ARIS — mock/demo data only. No backend. Every number here is illustrative.

export type RefereeStatus = "active" | "suspended" | "training" | "elite-pool";

export interface Referee {
  id: string;
  name: string;
  initials: string;
  country: string;
  flag: string;
  federation: string;
  zone: "UNIFFAC" | "UFOA" | "COSAFA" | "CECAFA" | "UNAF";
  level: "CAF Elite" | "FIFA Listed" | "National D1" | "Regional";
  age: number;
  yearsActive: number;
  status: RefereeStatus;
  arps: number; // Referee Performance Score, 0-100
  rmcsAvg: number; // Match compatibility, 0-100
  fitness: number; // 0-100
  matches: number;
  cards: { yellow: number; red: number };
  varAccuracy: number; // %
  trend: number; // delta vs last season
  nextMatch?: string;
  bio: string;
}

export const referees: Referee[] = [
  {
    id: "amina-kone",
    name: "Amina Koné",
    initials: "AK",
    country: "Côte d'Ivoire",
    flag: "🇨🇮",
    federation: "FIF",
    zone: "UFOA",
    level: "CAF Elite",
    age: 34,
    yearsActive: 11,
    status: "elite-pool",
    arps: 93.4,
    rmcsAvg: 91.2,
    fitness: 88,
    matches: 142,
    cards: { yellow: 421, red: 18 },
    varAccuracy: 97.1,
    trend: 2.3,
    nextMatch: "CAN Qualifiers — Sat 19:00",
    bio: "CAF Elite panel since 2022. Specialist in high-intensity derby fixtures across UFOA zone.",
  },
  {
    id: "thabo-nkosi",
    name: "Thabo Nkosi",
    initials: "TN",
    country: "South Africa",
    flag: "🇿🇦",
    federation: "SAFA",
    zone: "COSAFA",
    level: "FIFA Listed",
    age: 29,
    yearsActive: 7,
    status: "active",
    arps: 88.7,
    rmcsAvg: 85.9,
    fitness: 92,
    matches: 98,
    cards: { yellow: 289, red: 11 },
    varAccuracy: 95.4,
    trend: 1.1,
    nextMatch: "DStv Premiership — Sun 15:30",
    bio: "Fastest average positioning recovery in the COSAFA pool; strong VAR communication record.",
  },
  {
    id: "youssef-ben-ali",
    name: "Youssef Ben Ali",
    initials: "YB",
    country: "Tunisia",
    flag: "🇹🇳",
    federation: "FTF",
    zone: "UNAF",
    level: "CAF Elite",
    age: 38,
    yearsActive: 15,
    status: "active",
    arps: 90.1,
    rmcsAvg: 89.0,
    fitness: 79,
    matches: 211,
    cards: { yellow: 612, red: 27 },
    varAccuracy: 96.6,
    trend: -0.6,
    nextMatch: "CAF CL Group Stage — Wed 21:00",
    bio: "Most-capped active referee in the UNAF zone. Mentor in the CAF Elite development track.",
  },
  {
    id: "chidinma-okafor",
    name: "Chidinma Okafor",
    initials: "CO",
    country: "Nigeria",
    flag: "🇳🇬",
    federation: "NFF",
    zone: "UFOA",
    level: "FIFA Listed",
    age: 31,
    yearsActive: 9,
    status: "active",
    arps: 86.5,
    rmcsAvg: 84.2,
    fitness: 90,
    matches: 121,
    cards: { yellow: 356, red: 14 },
    varAccuracy: 94.8,
    trend: 3.4,
    nextMatch: "NPFL — Fri 17:00",
    bio: "Highest Pressure Index stability score in the 2025/26 season among NPFL officials.",
  },
  {
    id: "brian-otieno",
    name: "Brian Otieno",
    initials: "BO",
    country: "Kenya",
    flag: "🇰🇪",
    federation: "FKF",
    zone: "CECAFA",
    level: "National D1",
    age: 27,
    yearsActive: 5,
    status: "training",
    arps: 79.8,
    rmcsAvg: 76.1,
    fitness: 94,
    matches: 54,
    cards: { yellow: 143, red: 6 },
    varAccuracy: 90.2,
    trend: 5.8,
    nextMatch: "FKF Premier League — Sat 13:00",
    bio: "Fast-track CAF development candidate; enrolled in Career Manager certification track.",
  },
  {
    id: "fatou-diagne",
    name: "Fatou Diagne",
    initials: "FD",
    country: "Senegal",
    flag: "🇸🇳",
    federation: "FSF",
    zone: "UFOA",
    level: "CAF Elite",
    age: 33,
    yearsActive: 10,
    status: "elite-pool",
    arps: 92.0,
    rmcsAvg: 90.4,
    fitness: 86,
    matches: 133,
    cards: { yellow: 398, red: 16 },
    varAccuracy: 97.5,
    trend: 1.9,
    nextMatch: "CAN Qualifiers — Sun 18:00",
    bio: "Highest VAR-review accuracy in the current CAF Elite class of 2026.",
  },
  {
    id: "emmanuel-mensah",
    name: "Emmanuel Mensah",
    initials: "EM",
    country: "Ghana",
    flag: "🇬🇭",
    federation: "GFA",
    zone: "UFOA",
    level: "FIFA Listed",
    age: 36,
    yearsActive: 13,
    status: "suspended",
    arps: 74.2,
    rmcsAvg: 71.0,
    fitness: 68,
    matches: 176,
    cards: { yellow: 501, red: 31 },
    varAccuracy: 89.1,
    trend: -6.2,
    bio: "Currently under disciplinary review following a Decision Engine flag on Matchday 14.",
  },
  {
    id: "aisha-mwangi",
    name: "Aisha Mwangi",
    initials: "AM",
    country: "Tanzania",
    flag: "🇹🇿",
    federation: "TFF",
    zone: "CECAFA",
    level: "Regional",
    age: 25,
    yearsActive: 3,
    status: "training",
    arps: 71.4,
    rmcsAvg: 68.9,
    fitness: 91,
    matches: 29,
    cards: { yellow: 74, red: 3 },
    varAccuracy: 87.0,
    trend: 8.1,
    nextMatch: "NBC Premier League — Sat 15:00",
    bio: "Youngest referee in the CECAFA development cohort; steep positive ARPS trend.",
  },
  {
    id: "karim-haddad",
    name: "Karim Haddad",
    initials: "KH",
    country: "Egypt",
    flag: "🇪🇬",
    federation: "EFA",
    zone: "UNAF",
    level: "CAF Elite",
    age: 40,
    yearsActive: 17,
    status: "active",
    arps: 91.6,
    rmcsAvg: 88.3,
    fitness: 75,
    matches: 238,
    cards: { yellow: 664, red: 29 },
    varAccuracy: 96.9,
    trend: 0.4,
    nextMatch: "CAF Champions League Final — TBD",
    bio: "Assigned to the last two CAF Champions League finals via ARAE recommendation.",
  },
  {
    id: "ngozi-adeyemi",
    name: "Ngozi Adeyemi",
    initials: "NA",
    country: "Nigeria",
    flag: "🇳🇬",
    federation: "NFF",
    zone: "UFOA",
    level: "National D1",
    age: 30,
    yearsActive: 8,
    status: "active",
    arps: 82.9,
    rmcsAvg: 80.5,
    fitness: 84,
    matches: 87,
    cards: { yellow: 245, red: 9 },
    varAccuracy: 92.3,
    trend: 2.0,
    nextMatch: "NPFL — Sun 16:00",
    bio: "Consistent top-quartile Decision Engine agreement rate across the last 4 seasons.",
  },
  {
    id: "lesedi-modise",
    name: "Lesedi Modise",
    initials: "LM",
    country: "Botswana",
    flag: "🇧🇼",
    federation: "BFA",
    zone: "COSAFA",
    level: "Regional",
    age: 28,
    yearsActive: 6,
    status: "active",
    arps: 77.6,
    rmcsAvg: 74.8,
    fitness: 89,
    matches: 61,
    cards: { yellow: 178, red: 7 },
    varAccuracy: 88.4,
    trend: 1.3,
    nextMatch: "Botswana Premiership — Sat 15:00",
    bio: "Steady RMCS profile; recommended by ARAE for mid-tier continental fixtures.",
  },
  {
    id: "jean-baptiste-mbida",
    name: "Jean-Baptiste Mbida",
    initials: "JM",
    country: "Cameroon",
    flag: "🇨🇲",
    federation: "FECAFOOT",
    zone: "UNIFFAC",
    level: "CAF Elite",
    age: 35,
    yearsActive: 12,
    status: "elite-pool",
    arps: 89.9,
    rmcsAvg: 87.6,
    fitness: 83,
    matches: 164,
    cards: { yellow: 447, red: 20 },
    varAccuracy: 95.7,
    trend: 1.6,
    nextMatch: "CHAN Qualifiers — Fri 20:00",
    bio: "UNIFFAC zone lead assessor; frequently paired with elite VAR operators.",
  },
];

export const kpis = {
  totalReferees: 4218,
  activeFederations: 24,
  matchesAnalyzed: 18942,
  avgArps: 84.6,
  avgArpsTrend: 1.8,
  decisionsReviewed: 132_884,
  varAccuracy: 94.7,
  assignmentsThisWeek: 612,
  frictionAlertsOpen: 9,
};

export const arpsTrend = [
  { month: "Mar", score: 80.1 },
  { month: "Apr", score: 81.0 },
  { month: "May", score: 81.8 },
  { month: "Jun", score: 82.6 },
  { month: "Jul", score: 83.4 },
  { month: "Aug", score: 84.6 },
];

export const decisionsBreakdown = [
  { name: "Correct", value: 82, color: "#17c778" },
  { name: "Correct w/ VAR", value: 12, color: "#3b82f6" },
  { name: "Incorrect — overturned", value: 4, color: "#e2b13c" },
  { name: "Incorrect — missed", value: 2, color: "#ef4453" },
];

export const zoneDistribution = [
  { zone: "UFOA", referees: 1240, avgArps: 85.2 },
  { zone: "UNIFFAC", referees: 612, avgArps: 83.9 },
  { zone: "COSAFA", referees: 890, avgArps: 82.4 },
  { zone: "CECAFA", referees: 734, avgArps: 80.1 },
  { zone: "UNAF", referees: 742, avgArps: 86.0 },
];

export interface MatchDecision {
  id: string;
  minute: number;
  type: "Penalty" | "Red Card" | "Yellow Card" | "Offside" | "Handball" | "Foul";
  description: string;
  initialCall: "Given" | "Not given";
  varReview: boolean;
  finalCall: "Confirmed" | "Overturned";
  confidence: number;
  pressureIndex: number;
  players: string[];
}

export const sampleMatch = {
  id: "m-2026-0714",
  home: "Al Ahly",
  away: "Espérance de Tunis",
  competition: "CAF Champions League — Semi Final",
  date: "2026-08-09",
  score: "2 - 1",
  referee: "Karim Haddad",
  arpsForMatch: 91.8,
  rmcs: 94.2,
  pressureAvg: 71,
};

export const matchDecisions: MatchDecision[] = [
  { id: "d1", minute: 12, type: "Yellow Card", description: "Reckless tackle, studs up, midfield third.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 98, pressureIndex: 34, players: ["#6 Fathi", "#8 Ben Romdhane"] },
  { id: "d2", minute: 27, type: "Penalty", description: "Contact in the box during a corner delivery.", initialCall: "Not given", varReview: true, finalCall: "Overturned", confidence: 91, pressureIndex: 58, players: ["#9 Sherif", "#4 Meriah"] },
  { id: "d3", minute: 39, type: "Offside", description: "Tight offside call on the second phase of a counter.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 99, pressureIndex: 44, players: ["#11 Kahraba"] },
  { id: "d4", minute: 58, type: "Red Card", description: "Denial of an obvious goal-scoring opportunity.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 96, pressureIndex: 82, players: ["#5 Adam Dhaouadi"] },
  { id: "d5", minute: 71, type: "Handball", description: "Ball strikes arm in a non-natural position inside the box.", initialCall: "Not given", varReview: true, finalCall: "Confirmed", confidence: 88, pressureIndex: 76, players: ["#3 Ali Maaloul"] },
  { id: "d6", minute: 84, type: "Foul", description: "Late challenge near the technical area, high tempo phase.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 93, pressureIndex: 89, players: ["#17 Aliou Dieng"] },
];

export const pressureTimeline = [
  { minute: 0, pressure: 20 }, { minute: 10, pressure: 28 }, { minute: 20, pressure: 34 },
  { minute: 30, pressure: 52 }, { minute: 40, pressure: 46 }, { minute: 45, pressure: 60 },
  { minute: 55, pressure: 58 }, { minute: 60, pressure: 72 }, { minute: 70, pressure: 78 },
  { minute: 80, pressure: 88 }, { minute: 90, pressure: 94 },
];

// Heat map: normalized 0-100 x/y grid occupancy for a referee across a match
export function generateHeatPoints(seed = 1) {
  const points: { x: number; y: number; intensity: number }[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  for (let i = 0; i < 220; i++) {
    // referees bias toward the central diagonal channel
    const base = rand();
    const x = Math.min(100, Math.max(0, 50 + (rand() - 0.5) * 90 + Math.sin(base * 10) * 10));
    const y = Math.min(100, Math.max(0, 50 + (rand() - 0.5) * 60));
    points.push({ x: round(x), y: round(y), intensity: round(rand()) });
  }
  return points;
}

export interface AssignmentCandidate {
  refereeId: string;
  name: string;
  rmcs: number;
  fitness: number;
  travelHours: number;
  restDays: number;
  h2hExperience: number;
  frictionRisk: "Low" | "Medium" | "High";
  recommended: boolean;
}

export const assignmentCandidates: AssignmentCandidate[] = [
  { refereeId: "amina-kone", name: "Amina Koné", rmcs: 96, fitness: 88, travelHours: 2.5, restDays: 6, h2hExperience: 4, frictionRisk: "Low", recommended: true },
  { refereeId: "fatou-diagne", name: "Fatou Diagne", rmcs: 92, fitness: 86, travelHours: 4.1, restDays: 5, h2hExperience: 2, frictionRisk: "Low", recommended: false },
  { refereeId: "youssef-ben-ali", name: "Youssef Ben Ali", rmcs: 89, fitness: 79, travelHours: 6.2, restDays: 3, h2hExperience: 6, frictionRisk: "Medium", recommended: false },
  { refereeId: "karim-haddad", name: "Karim Haddad", rmcs: 85, fitness: 75, travelHours: 7.8, restDays: 2, h2hExperience: 8, frictionRisk: "High", recommended: false },
];

export interface RankingRow {
  rank: number;
  refereeId: string;
  name: string;
  country: string;
  flag: string;
  zone: string;
  arps: number;
  matches: number;
  delta: number;
}

export const rankings: RankingRow[] = referees
  .slice()
  .sort((a, b) => b.arps - a.arps)
  .map((r, i) => ({
    rank: i + 1,
    refereeId: r.id,
    name: r.name,
    country: r.country,
    flag: r.flag,
    zone: r.zone,
    arps: r.arps,
    matches: r.matches,
    delta: r.trend,
  }));

export interface CareerEvent {
  year: string;
  title: string;
  type: "License" | "Match" | "Training" | "Award" | "Assessment";
  detail: string;
}

export const careerTimeline: CareerEvent[] = [
  { year: "2015", title: "Regional Referee License", type: "License", detail: "Certified by FIF for Ligue Régionale fixtures." },
  { year: "2017", title: "National D1 Promotion", type: "License", detail: "Promoted after top-decile assessor scores." },
  { year: "2019", title: "FIFA Listed Referee", type: "License", detail: "Added to the FIFA international panel." },
  { year: "2021", title: "VAR Certification (CAF Academy)", type: "Training", detail: "Completed the CAF VAR Academy program in Cairo." },
  { year: "2022", title: "CAF Elite Panel", type: "License", detail: "Selected for the CAF Elite referee pool." },
  { year: "2023", title: "AFCON Group Stage Appointment", type: "Match", detail: "First continental tournament appointment." },
  { year: "2024", title: "Best Referee — UFOA Zone", type: "Award", detail: "Awarded for a 94.1 average ARPS across the season." },
  { year: "2025", title: "CAF Champions League Semi-Final", type: "Match", detail: "Highest-profile club appointment to date." },
  { year: "2026", title: "Mid-season Assessment: 93.4 ARPS", type: "Assessment", detail: "Top 3 in the CAF Elite panel year-to-date." },
];

export interface Competitor {
  name: string;
  zone: string;
  does: string;
  arisEdge: string;
}

export const competitors: Competitor[] = [
  {
    name: "Arbiter (Arbiter Sports)",
    zone: "USA — multi-sport",
    does: "Assignment, scheduling, availability, payments. No performance evaluation.",
    arisEdge: "ARIS adds performance scoring (ARPS), match compatibility (RMCS), and career management — Arbiter only schedules.",
  },
  {
    name: "Refr Sports (Refr AI)",
    zone: "USA — amateur multi-sport",
    does: "AI-assisted assignment, auto-confirmation, payments. Logistics-first.",
    arisEdge: "Same gap as Arbiter: no performance score, no digital referee passport.",
  },
  {
    name: "Assignr",
    zone: "USA — multi-sport",
    does: "Scheduling and payment for officials, rated mobile app. No performance evaluation.",
    arisEdge: "ARIS targets professional & federal African football, not US school/amateur sport.",
  },
  {
    name: "TrackSwift (Personar / PGMOL)",
    zone: "UK — Premier League",
    does: "Real-time AI analysis of referee/VAR communication + post-match review for the Premier League.",
    arisEdge: "Proprietary tool built for one federation (PGMOL), not sold in Africa. ARIS targets continental accessibility.",
  },
  {
    name: "Hawk-Eye / VAR hardware (FIFA QP)",
    zone: "Global — hardware/software vendors",
    does: "Goal-line tech, semi-automated offside. Real-time decisions, no human performance evaluation.",
    arisEdge: "ARIS doesn't replace VAR — it evaluates and supports the human referee before, during and after the match.",
  },
  {
    name: "CAF / COSAFA initiatives",
    zone: "Africa",
    does: "VAR training academies, progressive CAF rollout. No identified software platform for performance or assignment.",
    arisEdge: "The most open space for ARIS: no software competitor identified in Africa on this exact scope.",
  },
];

export interface ClientSegment {
  segment: string;
  usage: string;
}

export const clientSegments: ClientSegment[] = [
  { segment: "National Federations", usage: "FECAFOOT, FIF, and equivalents — manage their national refereeing corps." },
  { segment: "CAF Zones", usage: "UNIFFAC, UFOA, COSAFA, CECAFA, UNAF — regional refereeing coordination." },
  { segment: "CAF itself", usage: "AFCON, CHAN, interclub competition assignments — the most strategic long-term client." },
  { segment: "National pro leagues", usage: "1st & 2nd division championships — weekly assignment, season-long performance tracking." },
  { segment: "Referee academies & schools", usage: "Young referee training, progression tracking via Career Manager." },
  { segment: "Amateur / regional leagues", usage: "Volume market — simplified assignment + light tracking product." },
  { segment: "Sports media & broadcasters", usage: "Refereeing stats for pre-match analysis, subject to data-sharing agreements." },
  { segment: "Other sports federations", usage: "RMCS engine & scoring model transposable to basketball, handball — mid-term expansion." },
];

export const roadmapModules = [
  { module: "ARPS — Referee Performance Score", priority: "P1", desc: "Composite performance score for a referee's match.", area: "RIS" },
  { module: "Decision Engine", priority: "P1", desc: "Analysis engine for refereeing decisions (fouls, cards, VAR).", area: "RIS" },
  { module: "AI Referee Assignment Engine", priority: "P1", desc: "Assignment engine matching referee teams to match level & availability.", area: "ARAE" },
  { module: "RMCS — Match Compatibility Score", priority: "P1", desc: "Compatibility score between a referee's profile and a match's demands.", area: "ARAE" },
  { module: "Heat Maps", priority: "P2", desc: "Referee positioning map, enrichable with AfriScout event data.", area: "RIS" },
  { module: "Ranking / Leaderboard", priority: "P2", desc: "Referee ranking by cumulative performance.", area: "RIS" },
  { module: "Digital Referee Passport", priority: "P2", desc: "Full timestamped record: matches, evaluations, training, licenses.", area: "RIS" },
  { module: "Assignment Traceability", priority: "P2", desc: "Audit log of assignments and their justifications.", area: "ARAE" },
  { module: "Fitness Index", priority: "P3", desc: "Referee physical condition index during the match.", area: "RIS" },
  { module: "Pressure Index", priority: "P3", desc: "Contextual match-pressure index at the moment of each decision.", area: "RIS" },
  { module: "Referee Career Manager", priority: "P4", desc: "Career management: history, progression, training.", area: "Career" },
  { module: "Licenses & Certifications (FIFA/CAF)", priority: "P4", desc: "Certification tracking with renewal alerts.", area: "Career" },
];

export const leverageFeatures = [
  { feature: "Automated video decision review (no VAR hardware)", lever: "Reuses the existing AfriScout video tagging pipeline — same match footage, same trained taggers.", value: "Post-hoc decision support at marginal cost, where classic VAR needs dedicated cameras & operators — out of reach for most African leagues." },
  { feature: "Pressure-adjusted decision score", lever: "Combines AfriScout's existing metrics (PPDA, momentum, tempo, 15-min intensity) with refereeing decisions.", value: "No identified competitor links match tactical context to decision quality — a unique differentiator." },
  { feature: "Player-referee friction risk index", lever: "Cross-references AfriScout's player disciplinary history with the assigned referee's profile.", value: "Feeds RMCS with a predictive signal neither TrackSwift nor Arbiter can produce without a player database." },
  { feature: "Shared tagger workforce", lever: "Taggers already trained for AfriScout can be cross-trained to capture referee events (position, whistles, cards).", value: "Saves the time and cost of recruiting/training a dedicated ARIS data-collection team." },
  { feature: "Instant coverage of already-tagged matches", lever: "Every match already covered by AfriScout becomes automatically available for refereeing analysis.", value: "Faster launch than any competitor who'd need to negotiate footage access match by match." },
  { feature: "Combined Match + Refereeing report", lever: "One PDF dossier presents both tactical analysis (AfriScout) and refereeing quality (ARIS).", value: "A sellable product to leagues and media that no identified competitor unifies today." },
  { feature: "Single club/federation identifier", lever: "A client of both platforms has one account and one shared match calendar.", value: "Reduces adoption friction for clients running both products in parallel." },
];
