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
  {
    id: "samuel-asante",
    name: "Samuel Asante",
    initials: "SA",
    country: "Ghana",
    flag: "🇬🇭",
    federation: "GFA",
    zone: "UFOA",
    level: "FIFA Listed",
    age: 32,
    yearsActive: 9,
    status: "active",
    arps: 85.1,
    rmcsAvg: 82.7,
    fitness: 87,
    matches: 109,
    cards: { yellow: 312, red: 12 },
    varAccuracy: 93.6,
    trend: 2.1,
    nextMatch: "Ghana Premier League — Sat 16:00",
    bio: "Known for calm game management in high-tension title-race fixtures.",
  },
  {
    id: "grace-mutua",
    name: "Grace Mutua",
    initials: "GM",
    country: "Kenya",
    flag: "🇰🇪",
    federation: "FKF",
    zone: "CECAFA",
    level: "National D1",
    age: 29,
    yearsActive: 6,
    status: "active",
    arps: 81.3,
    rmcsAvg: 78.6,
    fitness: 90,
    matches: 72,
    cards: { yellow: 198, red: 8 },
    varAccuracy: 91.4,
    trend: 3.0,
    nextMatch: "FKF Women's Premier League — Sun 14:00",
    bio: "Highest-rated official in the CECAFA women's competition pool.",
  },
  {
    id: "moussa-traore",
    name: "Moussa Traoré",
    initials: "MT",
    country: "Mali",
    flag: "🇲🇱",
    federation: "FEMAFOOT",
    zone: "UFOA",
    level: "National D1",
    age: 31,
    yearsActive: 8,
    status: "active",
    arps: 80.4,
    rmcsAvg: 77.9,
    fitness: 85,
    matches: 94,
    cards: { yellow: 267, red: 13 },
    varAccuracy: 90.8,
    trend: -1.2,
    nextMatch: "Malian Première Division — Sat 17:00",
    bio: "Strong physical positioning scores; occasional card-count outlier under high pressure.",
  },
  {
    id: "patricia-banda",
    name: "Patricia Banda",
    initials: "PB",
    country: "Zambia",
    flag: "🇿🇲",
    federation: "FAZ",
    zone: "COSAFA",
    level: "FIFA Listed",
    age: 34,
    yearsActive: 11,
    status: "elite-pool",
    arps: 89.2,
    rmcsAvg: 86.8,
    fitness: 84,
    matches: 118,
    cards: { yellow: 331, red: 15 },
    varAccuracy: 95.0,
    trend: 2.7,
    nextMatch: "COSAFA Cup — Wed 19:00",
    bio: "First COSAFA-zone referee shortlisted for a CAF Elite promotion review this cycle.",
  },
  {
    id: "olivier-nkurunziza",
    name: "Olivier Nkurunziza",
    initials: "ON",
    country: "Burundi",
    flag: "🇧🇮",
    federation: "FFB",
    zone: "CECAFA",
    level: "Regional",
    age: 26,
    yearsActive: 4,
    status: "training",
    arps: 73.9,
    rmcsAvg: 70.5,
    fitness: 92,
    matches: 38,
    cards: { yellow: 96, red: 4 },
    varAccuracy: 88.2,
    trend: 4.4,
    nextMatch: "Burundi Ligue A — Sat 15:00",
    bio: "Enrolled in the CAF Academy accelerated development track for 2026/27.",
  },
  {
    id: "khadija-el-amrani",
    name: "Khadija El Amrani",
    initials: "KE",
    country: "Morocco",
    flag: "🇲🇦",
    federation: "FRMF",
    zone: "UNAF",
    level: "CAF Elite",
    age: 36,
    yearsActive: 14,
    status: "elite-pool",
    arps: 92.7,
    rmcsAvg: 90.9,
    fitness: 81,
    matches: 187,
    cards: { yellow: 512, red: 21 },
    varAccuracy: 97.3,
    trend: 1.4,
    nextMatch: "Botola Pro — Fri 20:00",
    bio: "Second-highest ARPS in the UNAF zone; regularly assigned to Casablanca derbies.",
  },
  {
    id: "isaac-boateng",
    name: "Isaac Boateng",
    initials: "IB",
    country: "Ghana",
    flag: "🇬🇭",
    federation: "GFA",
    zone: "UFOA",
    level: "National D1",
    age: 33,
    yearsActive: 10,
    status: "active",
    arps: 78.5,
    rmcsAvg: 75.2,
    fitness: 80,
    matches: 102,
    cards: { yellow: 289, red: 17 },
    varAccuracy: 89.6,
    trend: -2.4,
    nextMatch: "Ghana Premier League — Sun 15:00",
    bio: "Card-count trending above zone average; flagged for a Decision Engine consistency review.",
  },
  {
    id: "wanjiru-kamau",
    name: "Wanjiru Kamau",
    initials: "WK",
    country: "Kenya",
    flag: "🇰🇪",
    federation: "FKF",
    zone: "CECAFA",
    level: "FIFA Listed",
    age: 30,
    yearsActive: 7,
    status: "active",
    arps: 84.6,
    rmcsAvg: 81.9,
    fitness: 89,
    matches: 96,
    cards: { yellow: 251, red: 10 },
    varAccuracy: 93.1,
    trend: 3.6,
    nextMatch: "CECAFA Club Cup — Tue 18:00",
    bio: "Fastest-rising ARPS trend among FIFA Listed referees in CECAFA this season.",
  },
  {
    id: "abdoulaye-diallo",
    name: "Abdoulaye Diallo",
    initials: "AD",
    country: "Senegal",
    flag: "🇸🇳",
    federation: "FSF",
    zone: "UFOA",
    level: "CAF Elite",
    age: 37,
    yearsActive: 15,
    status: "active",
    arps: 90.8,
    rmcsAvg: 88.9,
    fitness: 77,
    matches: 203,
    cards: { yellow: 578, red: 24 },
    varAccuracy: 96.2,
    trend: 0.7,
    nextMatch: "CAF Confederation Cup — Thu 19:00",
    bio: "Veteran presence in the UFOA elite pool; mentors three CAF Academy candidates.",
  },
  {
    id: "naledi-dube",
    name: "Naledi Dube",
    initials: "ND",
    country: "Zimbabwe",
    flag: "🇿🇼",
    federation: "ZIFA",
    zone: "COSAFA",
    level: "Regional",
    age: 27,
    yearsActive: 5,
    status: "training",
    arps: 75.7,
    rmcsAvg: 72.3,
    fitness: 93,
    matches: 44,
    cards: { yellow: 121, red: 5 },
    varAccuracy: 88.9,
    trend: 6.5,
    nextMatch: "Castle Lager Premier Soccer League — Sat 15:00",
    bio: "Strong upward ARPS trajectory since joining the COSAFA development cohort.",
  },
  {
    id: "farid-benkirane",
    name: "Farid Benkirane",
    initials: "FB",
    country: "Algeria",
    flag: "🇩🇿",
    federation: "FAF",
    zone: "UNAF",
    level: "FIFA Listed",
    age: 34,
    yearsActive: 11,
    status: "active",
    arps: 87.9,
    rmcsAvg: 85.1,
    fitness: 83,
    matches: 148,
    cards: { yellow: 402, red: 19 },
    varAccuracy: 94.5,
    trend: 1.0,
    nextMatch: "Ligue 1 Algérie — Fri 19:00",
    bio: "High-volume UNAF official; consistent mid-90s VAR review accuracy for three seasons running.",
  },
  {
    id: "esther-nyambura",
    name: "Esther Nyambura",
    initials: "EN",
    country: "Uganda",
    flag: "🇺🇬",
    federation: "FUFA",
    zone: "CECAFA",
    level: "National D1",
    age: 28,
    yearsActive: 6,
    status: "active",
    arps: 79.3,
    rmcsAvg: 76.4,
    fitness: 88,
    matches: 68,
    cards: { yellow: 176, red: 7 },
    varAccuracy: 90.5,
    trend: 2.9,
    nextMatch: "Uganda Premier League — Sun 16:00",
    bio: "Selected for the CAF Academy VAR bridge program starting next quarter.",
  },
];

// Sub-indices referenced in the ARIS white paper (RAS, CEI, MDS, PRS, CI) —
// derived deterministically from a referee's core stats for demo purposes.
export function getSubIndices(referee: Referee) {
  const clamp = (n: number) => Math.max(55, Math.min(99, Math.round(n * 10) / 10));
  return {
    ras: clamp(referee.varAccuracy - 2), // Rule Application Score
    cei: clamp(100 - referee.cards.red * 1.1), // Card Escalation Index (control)
    mds: clamp(referee.rmcsAvg + 1.5), // Match Difficulty Suitability
    prs: clamp(referee.fitness * 0.55 + referee.arps * 0.45), // Pressure Resilience Score
    ci: clamp(100 - Math.abs(referee.trend) * 3.2), // Consistency Index
  };
}

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

export interface MatchRecord {
  id: string;
  home: string;
  away: string;
  competition: string;
  date: string;
  score: string;
  referee: string;
  refereeId: string;
  arpsForMatch: number;
  rmcs: number;
  pressureAvg: number;
  decisions: MatchDecision[];
  pressureTimeline: { minute: number; pressure: number }[];
}

export const matches: MatchRecord[] = [
  {
    id: "m-2026-0714",
    home: "Al Ahly",
    away: "Espérance de Tunis",
    competition: "CAF Champions League — Semi Final",
    date: "2026-08-09",
    score: "2 - 1",
    referee: "Karim Haddad",
    refereeId: "karim-haddad",
    arpsForMatch: 91.8,
    rmcs: 94.2,
    pressureAvg: 71,
    decisions: [
      { id: "d1", minute: 12, type: "Yellow Card", description: "Reckless tackle, studs up, midfield third.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 98, pressureIndex: 34, players: ["#6 Fathi", "#8 Ben Romdhane"] },
      { id: "d2", minute: 27, type: "Penalty", description: "Contact in the box during a corner delivery.", initialCall: "Not given", varReview: true, finalCall: "Overturned", confidence: 91, pressureIndex: 58, players: ["#9 Sherif", "#4 Meriah"] },
      { id: "d3", minute: 39, type: "Offside", description: "Tight offside call on the second phase of a counter.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 99, pressureIndex: 44, players: ["#11 Kahraba"] },
      { id: "d4", minute: 58, type: "Red Card", description: "Denial of an obvious goal-scoring opportunity.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 96, pressureIndex: 82, players: ["#5 Adam Dhaouadi"] },
      { id: "d5", minute: 71, type: "Handball", description: "Ball strikes arm in a non-natural position inside the box.", initialCall: "Not given", varReview: true, finalCall: "Confirmed", confidence: 88, pressureIndex: 76, players: ["#3 Ali Maaloul"] },
      { id: "d6", minute: 84, type: "Foul", description: "Late challenge near the technical area, high tempo phase.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 93, pressureIndex: 89, players: ["#17 Aliou Dieng"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 20 }, { minute: 10, pressure: 28 }, { minute: 20, pressure: 34 },
      { minute: 30, pressure: 52 }, { minute: 40, pressure: 46 }, { minute: 45, pressure: 60 },
      { minute: 55, pressure: 58 }, { minute: 60, pressure: 72 }, { minute: 70, pressure: 78 },
      { minute: 80, pressure: 88 }, { minute: 90, pressure: 94 },
    ],
  },
  {
    id: "m-2026-0726",
    home: "Mamelodi Sundowns",
    away: "Wydad AC",
    competition: "CAF Champions League — Group Stage",
    date: "2026-07-26",
    score: "1 - 1",
    referee: "Thabo Nkosi",
    refereeId: "thabo-nkosi",
    arpsForMatch: 87.3,
    rmcs: 88.5,
    pressureAvg: 63,
    decisions: [
      { id: "d1", minute: 8, type: "Foul", description: "Cynical foul breaking up a fast transition.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 95, pressureIndex: 29, players: ["#14 Zwane"] },
      { id: "d2", minute: 33, type: "Yellow Card", description: "Persistent dissent toward the assistant referee.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 97, pressureIndex: 41, players: ["#7 Guedes"] },
      { id: "d3", minute: 49, type: "Penalty", description: "Trip inside the box on a driving run.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 94, pressureIndex: 68, players: ["#9 Zungu", "#5 Yahya"] },
      { id: "d4", minute: 66, type: "Offside", description: "Marginal offside on a through ball to the striker.", initialCall: "Given", varReview: true, finalCall: "Overturned", confidence: 90, pressureIndex: 74, players: ["#11 Shalulile"] },
      { id: "d5", minute: 88, type: "Yellow Card", description: "Time-wasting during a late substitution.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 96, pressureIndex: 81, players: ["#2 Mokoena"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 18 }, { minute: 10, pressure: 24 }, { minute: 20, pressure: 30 },
      { minute: 30, pressure: 38 }, { minute: 40, pressure: 45 }, { minute: 45, pressure: 50 },
      { minute: 55, pressure: 62 }, { minute: 60, pressure: 66 }, { minute: 70, pressure: 71 },
      { minute: 80, pressure: 77 }, { minute: 90, pressure: 83 },
    ],
  },
  {
    id: "m-2026-0802",
    home: "Nigeria",
    away: "Senegal",
    competition: "AFCON Qualifiers — Matchday 4",
    date: "2026-08-02",
    score: "0 - 0",
    referee: "Amina Koné",
    refereeId: "amina-kone",
    arpsForMatch: 93.9,
    rmcs: 95.1,
    pressureAvg: 74,
    decisions: [
      { id: "d1", minute: 15, type: "Handball", description: "Deliberate handball clearing a corner delivery.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 97, pressureIndex: 45, players: ["#4 Troost-Ekong"] },
      { id: "d2", minute: 24, type: "Foul", description: "High-tempo challenge in the middle third.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 92, pressureIndex: 52, players: ["#8 Ndiaye"] },
      { id: "d3", minute: 41, type: "Penalty", description: "Shirt-pull inside the box during a set piece.", initialCall: "Not given", varReview: true, finalCall: "Confirmed", confidence: 89, pressureIndex: 63, players: ["#19 Osimhen", "#4 Koulibaly"] },
      { id: "d4", minute: 63, type: "Red Card", description: "Second bookable offense, reckless late tackle.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 98, pressureIndex: 85, players: ["#6 Onyeka"] },
      { id: "d5", minute: 77, type: "Offside", description: "Tight offside on a counter-attacking through ball.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 99, pressureIndex: 88, players: ["#10 Mane"] },
      { id: "d6", minute: 90, type: "Yellow Card", description: "Escalating frustration fouls in stoppage time.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 94, pressureIndex: 92, players: ["#17 Kamaldeen"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 25 }, { minute: 10, pressure: 34 }, { minute: 20, pressure: 40 },
      { minute: 30, pressure: 48 }, { minute: 40, pressure: 56 }, { minute: 45, pressure: 61 },
      { minute: 55, pressure: 68 }, { minute: 60, pressure: 79 }, { minute: 70, pressure: 84 },
      { minute: 80, pressure: 90 }, { minute: 90, pressure: 96 },
    ],
  },
  {
    id: "m-2026-0719",
    home: "Kaizer Chiefs",
    away: "Orlando Pirates",
    competition: "DStv Premiership — Soweto Derby",
    date: "2026-07-19",
    score: "2 - 2",
    referee: "Patricia Banda",
    refereeId: "patricia-banda",
    arpsForMatch: 88.6,
    rmcs: 90.0,
    pressureAvg: 79,
    decisions: [
      { id: "d1", minute: 6, type: "Yellow Card", description: "Early derby tone-setter, reckless challenge.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 96, pressureIndex: 55, players: ["#22 Ntsabeleng"] },
      { id: "d2", minute: 29, type: "Penalty", description: "Handball inside the box under pressure.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 93, pressureIndex: 71, players: ["#5 Mabaso"] },
      { id: "d3", minute: 47, type: "Foul", description: "Off-the-ball incident missed by the lead official.", initialCall: "Not given", varReview: true, finalCall: "Confirmed", confidence: 85, pressureIndex: 80, players: ["#9 Mabasa"] },
      { id: "d4", minute: 69, type: "Red Card", description: "Violent conduct after a heavy tackle exchange.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 97, pressureIndex: 93, players: ["#14 Sirino"] },
      { id: "d5", minute: 85, type: "Offside", description: "Marginal offside call disallowing a late equalizer.", initialCall: "Given", varReview: true, finalCall: "Overturned", confidence: 91, pressureIndex: 95, players: ["#11 Zwane"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 35 }, { minute: 10, pressure: 42 }, { minute: 20, pressure: 50 },
      { minute: 30, pressure: 61 }, { minute: 40, pressure: 66 }, { minute: 45, pressure: 70 },
      { minute: 55, pressure: 75 }, { minute: 60, pressure: 82 }, { minute: 70, pressure: 89 },
      { minute: 80, pressure: 94 }, { minute: 90, pressure: 98 },
    ],
  },
  {
    id: "m-2026-0803",
    home: "Raja Casablanca",
    away: "RS Berkane",
    competition: "Botola Pro — Matchday 22",
    date: "2026-08-03",
    score: "3 - 1",
    referee: "Khadija El Amrani",
    refereeId: "khadija-el-amrani",
    arpsForMatch: 90.5,
    rmcs: 91.8,
    pressureAvg: 58,
    decisions: [
      { id: "d1", minute: 18, type: "Foul", description: "Tactical foul stopping a promising attack.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 95, pressureIndex: 38, players: ["#6 El Kaabi"] },
      { id: "d2", minute: 37, type: "Yellow Card", description: "Simulation inside the penalty area.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 92, pressureIndex: 47, players: ["#10 Bencharki"] },
      { id: "d3", minute: 54, type: "Penalty", description: "Clear trip during a one-on-one chance.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 98, pressureIndex: 60, players: ["#9 Moutaraji"] },
      { id: "d4", minute: 79, type: "Offside", description: "Tight offside on a rebound goal.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 97, pressureIndex: 55, players: ["#7 Fajr"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 15 }, { minute: 10, pressure: 20 }, { minute: 20, pressure: 28 },
      { minute: 30, pressure: 33 }, { minute: 40, pressure: 39 }, { minute: 45, pressure: 42 },
      { minute: 55, pressure: 48 }, { minute: 60, pressure: 53 }, { minute: 70, pressure: 58 },
      { minute: 80, pressure: 64 }, { minute: 90, pressure: 69 },
    ],
  },
  {
    id: "m-2026-0731",
    home: "TP Mazembe",
    away: "Simba SC",
    competition: "CAF Confederation Cup — Group Stage",
    date: "2026-07-31",
    score: "1 - 0",
    referee: "Jean-Baptiste Mbida",
    refereeId: "jean-baptiste-mbida",
    arpsForMatch: 89.4,
    rmcs: 87.2,
    pressureAvg: 66,
    decisions: [
      { id: "d1", minute: 22, type: "Handball", description: "Ball strikes the arm in a blocking position.", initialCall: "Not given", varReview: true, finalCall: "Confirmed", confidence: 90, pressureIndex: 49, players: ["#3 Kabaso"] },
      { id: "d2", minute: 40, type: "Yellow Card", description: "Tactical delay after conceding possession.", initialCall: "Given", varReview: false, finalCall: "Confirmed", confidence: 95, pressureIndex: 55, players: ["#8 Chama"] },
      { id: "d3", minute: 61, type: "Penalty", description: "Foul during a corner-kick scramble.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 93, pressureIndex: 72, players: ["#19 Meschack"] },
      { id: "d4", minute: 83, type: "Red Card", description: "Serious foul play, endangering the opponent.", initialCall: "Given", varReview: true, finalCall: "Confirmed", confidence: 96, pressureIndex: 84, players: ["#15 Yondjouck"] },
    ],
    pressureTimeline: [
      { minute: 0, pressure: 22 }, { minute: 10, pressure: 27 }, { minute: 20, pressure: 33 },
      { minute: 30, pressure: 40 }, { minute: 40, pressure: 47 }, { minute: 45, pressure: 51 },
      { minute: 55, pressure: 58 }, { minute: 60, pressure: 64 }, { minute: 70, pressure: 71 },
      { minute: 80, pressure: 78 }, { minute: 90, pressure: 84 },
    ],
  },
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

export interface Fixture {
  id: string;
  home: string;
  away: string;
  competition: string;
  venue: string;
  date: string;
  candidates: AssignmentCandidate[];
}

export const fixtures: Fixture[] = [
  {
    id: "fx-1",
    home: "Al Ahly",
    away: "Espérance de Tunis",
    competition: "CAF Champions League — Final",
    venue: "Cairo, Egypt · Sat 20:00 CAT",
    date: "2026-08-22",
    candidates: [
      { refereeId: "amina-kone", name: "Amina Koné", rmcs: 96, fitness: 88, travelHours: 2.5, restDays: 6, h2hExperience: 4, frictionRisk: "Low", recommended: true },
      { refereeId: "fatou-diagne", name: "Fatou Diagne", rmcs: 92, fitness: 86, travelHours: 4.1, restDays: 5, h2hExperience: 2, frictionRisk: "Low", recommended: false },
      { refereeId: "youssef-ben-ali", name: "Youssef Ben Ali", rmcs: 89, fitness: 79, travelHours: 6.2, restDays: 3, h2hExperience: 6, frictionRisk: "Medium", recommended: false },
      { refereeId: "karim-haddad", name: "Karim Haddad", rmcs: 85, fitness: 75, travelHours: 7.8, restDays: 2, h2hExperience: 8, frictionRisk: "High", recommended: false },
    ],
  },
  {
    id: "fx-2",
    home: "Nigeria",
    away: "Cameroon",
    competition: "AFCON Qualifiers — Matchday 5",
    venue: "Lagos, Nigeria · Sun 17:00 WAT",
    date: "2026-08-23",
    candidates: [
      { refereeId: "chidinma-okafor", name: "Chidinma Okafor", rmcs: 90, fitness: 90, travelHours: 0.5, restDays: 7, h2hExperience: 3, frictionRisk: "Low", recommended: true },
      { refereeId: "ngozi-adeyemi", name: "Ngozi Adeyemi", rmcs: 84, fitness: 84, travelHours: 0.5, restDays: 7, h2hExperience: 1, frictionRisk: "Low", recommended: false },
      { refereeId: "abdoulaye-diallo", name: "Abdoulaye Diallo", rmcs: 88, fitness: 77, travelHours: 5.4, restDays: 3, h2hExperience: 5, frictionRisk: "Medium", recommended: false },
      { refereeId: "samuel-asante", name: "Samuel Asante", rmcs: 82, fitness: 87, travelHours: 3.1, restDays: 4, h2hExperience: 2, frictionRisk: "Low", recommended: false },
    ],
  },
  {
    id: "fx-3",
    home: "Mamelodi Sundowns",
    away: "Kaizer Chiefs",
    competition: "DStv Premiership — Matchday 18",
    venue: "Pretoria, South Africa · Sat 15:30 SAST",
    date: "2026-08-23",
    candidates: [
      { refereeId: "patricia-banda", name: "Patricia Banda", rmcs: 93, fitness: 84, travelHours: 3.4, restDays: 5, h2hExperience: 3, frictionRisk: "Low", recommended: true },
      { refereeId: "thabo-nkosi", name: "Thabo Nkosi", rmcs: 91, fitness: 92, travelHours: 0.8, restDays: 2, h2hExperience: 6, frictionRisk: "Medium", recommended: false },
      { refereeId: "lesedi-modise", name: "Lesedi Modise", rmcs: 79, fitness: 89, travelHours: 4.9, restDays: 6, h2hExperience: 1, frictionRisk: "Low", recommended: false },
      { refereeId: "naledi-dube", name: "Naledi Dube", rmcs: 74, fitness: 93, travelHours: 6.1, restDays: 7, h2hExperience: 0, frictionRisk: "Medium", recommended: false },
    ],
  },
  {
    id: "fx-4",
    home: "TP Mazembe",
    away: "Simba SC",
    competition: "CAF Confederation Cup — Semi Final",
    venue: "Lubumbashi, DR Congo · Wed 19:00 CAT",
    date: "2026-08-26",
    candidates: [
      { refereeId: "jean-baptiste-mbida", name: "Jean-Baptiste Mbida", rmcs: 89, fitness: 83, travelHours: 3.8, restDays: 4, h2hExperience: 5, frictionRisk: "Low", recommended: true },
      { refereeId: "olivier-nkurunziza", name: "Olivier Nkurunziza", rmcs: 71, fitness: 92, travelHours: 4.2, restDays: 6, h2hExperience: 0, frictionRisk: "Medium", recommended: false },
      { refereeId: "farid-benkirane", name: "Farid Benkirane", rmcs: 84, fitness: 83, travelHours: 8.9, restDays: 3, h2hExperience: 2, frictionRisk: "High", recommended: false },
      { refereeId: "moussa-traore", name: "Moussa Traoré", rmcs: 76, fitness: 85, travelHours: 6.7, restDays: 5, h2hExperience: 1, frictionRisk: "Medium", recommended: false },
    ],
  },
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

export interface Notification {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: "emerald" | "gold" | "red" | "blue";
  read: boolean;
}

export const notifications: Notification[] = [
  { id: "n1", title: "ARAE recommendation ready", detail: "Amina Koné recommended for Al Ahly vs. Espérance de Tunis (CAF CL Final).", time: "8 min ago", tone: "emerald", read: false },
  { id: "n2", title: "Disciplinary review opened", detail: "Emmanuel Mensah flagged by the Decision Engine after Matchday 14.", time: "1 hour ago", tone: "red", read: false },
  { id: "n3", title: "License renewal due", detail: "Amina Koné's VAR Certification (CAF Academy) expires in 60 days.", time: "3 hours ago", tone: "gold", read: false },
  { id: "n4", title: "New assessment published", detail: "Mid-season CAF Elite panel assessment now available for 12 referees.", time: "Yesterday", tone: "blue", read: true },
  { id: "n5", title: "Zone leaderboard updated", detail: "UNAF zone average ARPS crossed 86.0 for the first time this season.", time: "2 days ago", tone: "emerald", read: true },
  { id: "n6", title: "Fixture assignment confirmed", detail: "Patricia Banda confirmed for Mamelodi Sundowns vs. Kaizer Chiefs.", time: "3 days ago", tone: "blue", read: true },
];

export interface Federation {
  code: string;
  country: string;
  flag: string;
  zone: string;
  refereeCount: number;
  avgArps: number;
  eliteCount: number;
}

export const federations: Federation[] = Array.from(
  referees.reduce((map, r) => {
    const entry = map.get(r.federation) ?? {
      code: r.federation,
      country: r.country,
      flag: r.flag,
      zone: r.zone,
      total: 0,
      arpsSum: 0,
      eliteCount: 0,
    };
    entry.total += 1;
    entry.arpsSum += r.arps;
    if (r.level === "CAF Elite") entry.eliteCount += 1;
    map.set(r.federation, entry);
    return map;
  }, new Map<string, { code: string; country: string; flag: string; zone: string; total: number; arpsSum: number; eliteCount: number }>()),
  ([, v]) => ({
    code: v.code,
    country: v.country,
    flag: v.flag,
    zone: v.zone,
    refereeCount: v.total,
    avgArps: Math.round((v.arpsSum / v.total) * 10) / 10,
    eliteCount: v.eliteCount,
  }),
).sort((a, b) => b.avgArps - a.avgArps);

// Deterministic synthetic match history for a referee's passport page —
// blends any featured `matches` entry with generated past fixtures.
const historyOpponents = [
  "AS Vita Club", "Zamalek SC", "Enyimba FC", "Petro de Luanda", "Young Africans SC",
  "Horoya AC", "CS Constantine", "Coton Sport", "AmaZulu FC", "Stade Malien",
];
const historyCompetitions = [
  "League fixture", "Cup Round of 16", "Continental qualifier", "Derby fixture", "Playoff round",
];

export function getMatchHistory(referee: Referee) {
  const featured = matches.filter((m) => m.refereeId === referee.id);
  let seed = referee.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const synthetic = Array.from({ length: 5 - featured.length }, (_, i) => {
    const opponent = historyOpponents[Math.floor(rand() * historyOpponents.length)];
    const competition = historyCompetitions[Math.floor(rand() * historyCompetitions.length)];
    const homeGoals = Math.floor(rand() * 4);
    const awayGoals = Math.floor(rand() * 4);
    const daysAgo = 14 * (i + 1) + Math.floor(rand() * 10);
    const arps = Math.round((referee.arps - rand() * 6 + 1) * 10) / 10;
    return {
      id: `${referee.id}-hist-${i}`,
      opponent,
      competition,
      score: `${homeGoals} - ${awayGoals}`,
      daysAgo,
      arps: Math.max(60, Math.min(99, arps)),
    };
  });
  return { featured, synthetic };
}
