// ARIS — demo data only. No backend, no network. Every number here is illustrative.
// Everything is deterministic: the same build always produces the same calendar,
// which is what makes a static export safe to hydrate.

// `let` because the live build replaces it with the Worker's date (see applySnapshot at the foot of this file).
export let DEMO_TODAY = "2026-08-31"; // a Monday — the demo week starts here
export const SEASON = "2026/27";

/* ------------------------------------------------------------------ *
 * Geography
 * ------------------------------------------------------------------ */

import type { AvailabilityState, CrewRole, CrewSlot, Fixture, SlotState, Zone } from "./core/types";
import { crewRoles } from "./core/types";

// The types the Worker shares with the app live in ./core/types.
export type { AvailabilityState, CrewRole, CrewSlot, Fixture, SlotState, Zone };
export { crewRoles };

export const zones: Zone[] = ["UNAF", "UFOA-A", "UFOA-B", "UNIFFAC", "CECAFA", "COSAFA"];

export const zoneNames: Record<Zone, string> = {
  UNAF: "North Africa",
  "UFOA-A": "West Africa A",
  "UFOA-B": "West Africa B",
  UNIFFAC: "Central Africa",
  CECAFA: "East Africa",
  COSAFA: "Southern Africa",
};

export const zoneNamesFr: Record<Zone, string> = {
  UNAF: "Afrique du Nord",
  "UFOA-A": "Afrique de l'Ouest A",
  "UFOA-B": "Afrique de l'Ouest B",
  UNIFFAC: "Afrique centrale",
  CECAFA: "Afrique de l'Est",
  COSAFA: "Afrique australe",
};

export type SyncHealth = "healthy" | "stale" | "manual";

export interface Country {
  code: string;
  name: string;
  nameFr: string;
  flag: string;
  federation: string;
  zone: Zone;
  capital: string;
  syncSource: "COMET" | "League feed" | "Manual entry";
  syncHealth: SyncHealth;
  lastSyncHours: number;
  clubs: string[];
}

export const countries: Country[] = [
  { code: "EGY", name: "Egypt", nameFr: "Égypte", flag: "🇪🇬", federation: "EFA", zone: "UNAF", capital: "Cairo", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 2, clubs: ["Al Ahly", "Zamalek SC", "Pyramids FC", "Ismaily SC", "Al Masry", "Ceramica Cleopatra"] },
  { code: "MAR", name: "Morocco", nameFr: "Maroc", flag: "🇲🇦", federation: "FRMF", zone: "UNAF", capital: "Rabat", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 1, clubs: ["Raja Casablanca", "Wydad AC", "RS Berkane", "AS FAR", "Maghreb de Fès", "MC Oujda"] },
  { code: "TUN", name: "Tunisia", nameFr: "Tunisie", flag: "🇹🇳", federation: "FTF", zone: "UNAF", capital: "Tunis", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 3, clubs: ["Espérance de Tunis", "Étoile du Sahel", "Club Africain", "CS Sfaxien", "Stade Tunisien"] },
  { code: "DZA", name: "Algeria", nameFr: "Algérie", flag: "🇩🇿", federation: "FAF", zone: "UNAF", capital: "Algiers", syncSource: "League feed", syncHealth: "healthy", lastSyncHours: 5, clubs: ["CR Belouizdad", "JS Kabylie", "MC Alger", "ES Sétif", "USM Alger"] },
  { code: "SEN", name: "Senegal", nameFr: "Sénégal", flag: "🇸🇳", federation: "FSF", zone: "UFOA-A", capital: "Dakar", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 4, clubs: ["Casa Sports", "Génération Foot", "ASC Jaraaf", "Teungueth FC", "AS Pikine"] },
  { code: "MLI", name: "Mali", nameFr: "Mali", flag: "🇲🇱", federation: "FEMAFOOT", zone: "UFOA-A", capital: "Bamako", syncSource: "League feed", syncHealth: "stale", lastSyncHours: 62, clubs: ["Stade Malien", "Djoliba AC", "AS Real Bamako", "Onze Créateurs"] },
  { code: "CIV", name: "Côte d'Ivoire", nameFr: "Côte d'Ivoire", flag: "🇨🇮", federation: "FIF", zone: "UFOA-B", capital: "Abidjan", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 2, clubs: ["ASEC Mimosas", "Africa Sports", "Stade d'Abidjan", "SOL FC", "Racing Abidjan"] },
  { code: "GHA", name: "Ghana", nameFr: "Ghana", flag: "🇬🇭", federation: "GFA", zone: "UFOA-B", capital: "Accra", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 6, clubs: ["Asante Kotoko", "Hearts of Oak", "Aduana Stars", "Medeama SC", "Nations FC"] },
  { code: "NGA", name: "Nigeria", nameFr: "Nigéria", flag: "🇳🇬", federation: "NFF", zone: "UFOA-B", capital: "Abuja", syncSource: "League feed", syncHealth: "healthy", lastSyncHours: 8, clubs: ["Enyimba FC", "Rivers United", "Rangers International", "Remo Stars", "Plateau United"] },
  { code: "CMR", name: "Cameroon", nameFr: "Cameroun", flag: "🇨🇲", federation: "FECAFOOT", zone: "UNIFFAC", capital: "Yaoundé", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 7, clubs: ["Coton Sport", "Union Douala", "Canon Yaoundé", "PWD Bamenda"] },
  { code: "COD", name: "DR Congo", nameFr: "RD Congo", flag: "🇨🇩", federation: "FECOFA", zone: "UNIFFAC", capital: "Kinshasa", syncSource: "Manual entry", syncHealth: "manual", lastSyncHours: 30, clubs: ["TP Mazembe", "AS Vita Club", "AS Maniema Union", "FC Lupopo"] },
  { code: "KEN", name: "Kenya", nameFr: "Kenya", flag: "🇰🇪", federation: "FKF", zone: "CECAFA", capital: "Nairobi", syncSource: "League feed", syncHealth: "healthy", lastSyncHours: 9, clubs: ["Gor Mahia", "AFC Leopards", "Tusker FC", "Kakamega Homeboyz"] },
  { code: "TZA", name: "Tanzania", nameFr: "Tanzanie", flag: "🇹🇿", federation: "TFF", zone: "CECAFA", capital: "Dar es Salaam", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 3, clubs: ["Young Africans SC", "Simba SC", "Azam FC", "Coastal Union"] },
  { code: "UGA", name: "Uganda", nameFr: "Ouganda", flag: "🇺🇬", federation: "FUFA", zone: "CECAFA", capital: "Kampala", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 11, clubs: ["KCCA FC", "Vipers SC", "URA FC", "Express FC"] },
  { code: "BDI", name: "Burundi", nameFr: "Burundi", flag: "🇧🇮", federation: "FFB", zone: "CECAFA", capital: "Bujumbura", syncSource: "Manual entry", syncHealth: "manual", lastSyncHours: 44, clubs: ["Vital'O FC", "Aigle Noir", "Le Messager Ngozi"] },
  { code: "ZAF", name: "South Africa", nameFr: "Afrique du Sud", flag: "🇿🇦", federation: "SAFA", zone: "COSAFA", capital: "Johannesburg", syncSource: "League feed", syncHealth: "healthy", lastSyncHours: 1, clubs: ["Mamelodi Sundowns", "Kaizer Chiefs", "Orlando Pirates", "SuperSport United", "Stellenbosch FC"] },
  { code: "ZMB", name: "Zambia", nameFr: "Zambie", flag: "🇿🇲", federation: "FAZ", zone: "COSAFA", capital: "Lusaka", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 5, clubs: ["ZESCO United", "Power Dynamos", "Nkana FC", "Red Arrows"] },
  { code: "ZWE", name: "Zimbabwe", nameFr: "Zimbabwe", flag: "🇿🇼", federation: "ZIFA", zone: "COSAFA", capital: "Harare", syncSource: "League feed", syncHealth: "stale", lastSyncHours: 51, clubs: ["Dynamos FC", "CAPS United", "Highlanders FC", "FC Platinum"] },
  { code: "BWA", name: "Botswana", nameFr: "Botswana", flag: "🇧🇼", federation: "BFA", zone: "COSAFA", capital: "Gaborone", syncSource: "Manual entry", syncHealth: "manual", lastSyncHours: 28, clubs: ["Township Rollers", "Gaborone United", "Jwaneng Galaxy"] },
  { code: "AGO", name: "Angola", nameFr: "Angola", flag: "🇦🇴", federation: "FAF-AGO", zone: "COSAFA", capital: "Luanda", syncSource: "COMET", syncHealth: "healthy", lastSyncHours: 6, clubs: ["Petro de Luanda", "Sagrada Esperança", "1º de Agosto", "Interclube"] },
];

export const countryByCode = new Map(countries.map((c) => [c.code, c]));

export function countryName(code: string, locale: string) {
  if (code === "CAF") return locale === "fr" ? "Compétitions CAF" : "CAF competitions";
  const c = countryByCode.get(code);
  if (!c) return code;
  return locale === "fr" ? c.nameFr : c.name;
}

export function countryFlag(code: string) {
  return code === "CAF" ? "🌍" : (countryByCode.get(code)?.flag ?? "🏳️");
}

/* ------------------------------------------------------------------ *
 * Competitions
 * ------------------------------------------------------------------ */

export type CompetitionTier = "d1" | "d2" | "cup" | "continental";

export interface Competition {
  id: string;
  countryCode: string;
  name: string;
  tier: CompetitionTier;
  gender: "M" | "W";
  matchdays: number;
  currentMatchday: number;
  varEnabled: boolean;
  /** Weight used for fixture importance. */
  weight: number;
}

const domesticLeagues: Array<[string, string, boolean]> = [
  ["EGY", "Egyptian Premier League", true],
  ["MAR", "Botola Pro D1", true],
  ["TUN", "Ligue Professionnelle 1", true],
  ["DZA", "Ligue 1 Algérie", true],
  ["SEN", "Ligue 1 Sénégal", false],
  ["MLI", "Première Division", false],
  ["CIV", "Ligue 1 Côte d'Ivoire", false],
  ["GHA", "Ghana Premier League", false],
  ["NGA", "Nigeria Premier Football League", false],
  ["CMR", "Elite One", false],
  ["COD", "Linafoot", false],
  ["KEN", "FKF Premier League", false],
  ["TZA", "NBC Premier League", true],
  ["UGA", "Uganda Premier League", false],
  ["BDI", "Ligue A", false],
  ["ZAF", "Betway Premiership", true],
  ["ZMB", "Super League", false],
  ["ZWE", "Premier Soccer League", false],
  ["BWA", "Botswana Premier League", false],
  ["AGO", "Girabola", false],
];

export const competitions: Competition[] = [
  ...domesticLeagues.map<Competition>(([code, name, varEnabled]) => ({
    id: `${code.toLowerCase()}-d1`,
    countryCode: code,
    name,
    tier: "d1",
    gender: "M",
    matchdays: 30,
    currentMatchday: 5,
    varEnabled,
    weight: varEnabled ? 62 : 48,
  })),
  {
    id: "caf-cl",
    countryCode: "CAF",
    name: "CAF Champions League",
    tier: "continental",
    gender: "M",
    matchdays: 6,
    currentMatchday: 2,
    varEnabled: true,
    weight: 95,
  },
  {
    id: "caf-cc",
    countryCode: "CAF",
    name: "CAF Confederation Cup",
    tier: "continental",
    gender: "M",
    matchdays: 6,
    currentMatchday: 2,
    varEnabled: true,
    weight: 84,
  },
  {
    id: "afcon-q",
    countryCode: "CAF",
    name: "AFCON Qualifiers",
    tier: "continental",
    gender: "M",
    matchdays: 6,
    currentMatchday: 4,
    varEnabled: true,
    weight: 92,
  },
  {
    id: "cafwcl",
    countryCode: "CAF",
    name: "CAF Women's Champions League — Qualifiers",
    tier: "continental",
    gender: "W",
    matchdays: 4,
    currentMatchday: 2,
    varEnabled: false,
    weight: 76,
  },
];

export const competitionById = new Map(competitions.map((c) => [c.id, c]));

/* ------------------------------------------------------------------ *
 * Officials
 * ------------------------------------------------------------------ */

export type RefereeStatus = "active" | "suspended" | "training" | "elite-pool";
export type RefereeLevel = "CAF Elite" | "FIFA Listed" | "National D1" | "Regional";

export interface Referee {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  city: string;
  level: RefereeLevel;
  age: number;
  yearsActive: number;
  status: RefereeStatus;
  arps: number;
  rmcsAvg: number;
  fitness: number;
  matches: number;
  cards: { yellow: number; red: number };
  varAccuracy: number;
  varQualified: boolean;
  trend: number;
  bio: { en: string; fr: string };
}

export const referees: Referee[] = [
  { id: "amina-kone", name: "Amina Koné", initials: "AK", countryCode: "CIV", city: "Abidjan", level: "CAF Elite", age: 34, yearsActive: 11, status: "elite-pool", arps: 93.4, rmcsAvg: 91.2, fitness: 88, matches: 142, cards: { yellow: 421, red: 18 }, varAccuracy: 97.1, varQualified: true, trend: 2.3, bio: { en: "On the CAF Elite panel since 2022. Trusted with high-intensity derbies across the West African zone.", fr: "Au panel CAF Elite depuis 2022. Désignée sur les derbies à forte intensité de la zone Afrique de l'Ouest." } },
  { id: "thabo-nkosi", name: "Thabo Nkosi", initials: "TN", countryCode: "ZAF", city: "Durban", level: "FIFA Listed", age: 29, yearsActive: 7, status: "active", arps: 88.7, rmcsAvg: 85.9, fitness: 92, matches: 98, cards: { yellow: 289, red: 11 }, varAccuracy: 95.4, varQualified: true, trend: 1.1, bio: { en: "Quickest recovery runs in the southern pool, and a clean record on VAR communication.", fr: "Meilleures courses de replacement du groupe austral, et un dossier sans faute sur la communication VAR." } },
  { id: "youssef-ben-ali", name: "Youssef Ben Ali", initials: "YB", countryCode: "TUN", city: "Tunis", level: "CAF Elite", age: 38, yearsActive: 15, status: "active", arps: 90.1, rmcsAvg: 89.0, fitness: 79, matches: 211, cards: { yellow: 612, red: 27 }, varAccuracy: 96.6, varQualified: true, trend: -0.6, bio: { en: "Most-capped active referee in North Africa. Mentors three officials on the CAF development track.", fr: "Arbitre en activité le plus capé d'Afrique du Nord. Encadre trois officiels du parcours de développement CAF." } },
  { id: "chidinma-okafor", name: "Chidinma Okafor", initials: "CO", countryCode: "NGA", city: "Lagos", level: "FIFA Listed", age: 31, yearsActive: 9, status: "active", arps: 86.5, rmcsAvg: 84.2, fitness: 90, matches: 121, cards: { yellow: 356, red: 14 }, varAccuracy: 94.8, varQualified: true, trend: 3.4, bio: { en: "Holds her marks under pressure better than anyone else in the Nigerian corps this season.", fr: "Celle qui tient le mieux ses notes sous pression dans le corps arbitral nigérian cette saison." } },
  { id: "brian-otieno", name: "Brian Otieno", initials: "BO", countryCode: "KEN", city: "Kisumu", level: "National D1", age: 27, yearsActive: 5, status: "training", arps: 79.8, rmcsAvg: 76.1, fitness: 94, matches: 54, cards: { yellow: 143, red: 6 }, varAccuracy: 90.2, varQualified: false, trend: 5.8, bio: { en: "Fast-track candidate for the CAF development programme; on the certification track now.", fr: "Candidat en voie accélérée pour le programme de développement CAF ; actuellement en certification." } },
  { id: "fatou-diagne", name: "Fatou Diagne", initials: "FD", countryCode: "SEN", city: "Dakar", level: "CAF Elite", age: 33, yearsActive: 10, status: "elite-pool", arps: 92.0, rmcsAvg: 90.4, fitness: 86, matches: 133, cards: { yellow: 398, red: 16 }, varAccuracy: 97.5, varQualified: true, trend: 1.9, bio: { en: "Best VAR review accuracy in the current CAF Elite class.", fr: "Meilleure justesse en revue VAR de la promotion CAF Elite actuelle." } },
  { id: "emmanuel-mensah", name: "Emmanuel Mensah", initials: "EM", countryCode: "GHA", city: "Kumasi", level: "FIFA Listed", age: 36, yearsActive: 13, status: "suspended", arps: 74.2, rmcsAvg: 71.0, fitness: 68, matches: 176, cards: { yellow: 501, red: 31 }, varAccuracy: 89.1, varQualified: true, trend: -6.2, bio: { en: "Under disciplinary review after two overturned calls on matchday 14. Off the appointment list.", fr: "En procédure disciplinaire après deux décisions annulées lors de la 14e journée. Retiré des désignations." } },
  { id: "aisha-mwangi", name: "Aisha Mwangi", initials: "AM", countryCode: "TZA", city: "Arusha", level: "Regional", age: 25, yearsActive: 3, status: "training", arps: 71.4, rmcsAvg: 68.9, fitness: 91, matches: 29, cards: { yellow: 74, red: 3 }, varAccuracy: 87.0, varQualified: false, trend: 8.1, bio: { en: "Youngest official in the East African cohort, and the steepest improvement curve on the list.", fr: "Plus jeune officielle de la promotion est-africaine, et la plus forte progression de la liste." } },
  { id: "karim-haddad", name: "Karim Haddad", initials: "KH", countryCode: "EGY", city: "Cairo", level: "CAF Elite", age: 40, yearsActive: 17, status: "active", arps: 91.6, rmcsAvg: 88.3, fitness: 75, matches: 238, cards: { yellow: 664, red: 29 }, varAccuracy: 96.9, varQualified: true, trend: 0.4, bio: { en: "Took charge of the last two Champions League finals. Fitness is the one line to watch.", fr: "A dirigé les deux dernières finales de Ligue des champions. La condition physique est le seul point de vigilance." } },
  { id: "ngozi-adeyemi", name: "Ngozi Adeyemi", initials: "NA", countryCode: "NGA", city: "Enugu", level: "National D1", age: 30, yearsActive: 8, status: "active", arps: 82.9, rmcsAvg: 80.5, fitness: 84, matches: 87, cards: { yellow: 245, red: 9 }, varAccuracy: 92.3, varQualified: false, trend: 2.0, bio: { en: "Four straight seasons in the top quartile for agreement with the review panel.", fr: "Quatre saisons d'affilée dans le quart supérieur pour la concordance avec la commission de revue." } },
  { id: "lesedi-modise", name: "Lesedi Modise", initials: "LM", countryCode: "BWA", city: "Gaborone", level: "Regional", age: 28, yearsActive: 6, status: "active", arps: 77.6, rmcsAvg: 74.8, fitness: 89, matches: 61, cards: { yellow: 178, red: 7 }, varAccuracy: 88.4, varQualified: false, trend: 1.3, bio: { en: "Steady compatibility profile; suited to mid-tier continental fixtures.", fr: "Profil de compatibilité régulier ; adapté aux rencontres continentales de niveau intermédiaire." } },
  { id: "jean-baptiste-mbida", name: "Jean-Baptiste Mbida", initials: "JM", countryCode: "CMR", city: "Douala", level: "CAF Elite", age: 35, yearsActive: 12, status: "elite-pool", arps: 89.9, rmcsAvg: 87.6, fitness: 83, matches: 164, cards: { yellow: 447, red: 20 }, varAccuracy: 95.7, varQualified: true, trend: 1.6, bio: { en: "Lead assessor for the Central African zone; usually paired with an elite VAR operator.", fr: "Observateur référent de la zone Afrique centrale ; associé le plus souvent à un opérateur VAR de haut niveau." } },
  { id: "samuel-asante", name: "Samuel Asante", initials: "SA", countryCode: "GHA", city: "Accra", level: "FIFA Listed", age: 32, yearsActive: 9, status: "active", arps: 85.1, rmcsAvg: 82.7, fitness: 87, matches: 109, cards: { yellow: 312, red: 12 }, varAccuracy: 93.6, varQualified: true, trend: 2.1, bio: { en: "Calm in title-race fixtures — his cards-per-match figure barely moves when the stakes rise.", fr: "Serein sur les matchs de haut de tableau — son ratio de cartons bouge à peine quand l'enjeu monte." } },
  { id: "grace-mutua", name: "Grace Mutua", initials: "GM", countryCode: "KEN", city: "Nairobi", level: "National D1", age: 29, yearsActive: 6, status: "active", arps: 81.3, rmcsAvg: 78.6, fitness: 90, matches: 72, cards: { yellow: 198, red: 8 }, varAccuracy: 91.4, varQualified: false, trend: 3.0, bio: { en: "Top-rated official in the East African women's competition pool.", fr: "Officielle la mieux notée du groupe des compétitions féminines est-africaines." } },
  { id: "moussa-traore", name: "Moussa Traoré", initials: "MT", countryCode: "MLI", city: "Bamako", level: "National D1", age: 31, yearsActive: 8, status: "active", arps: 80.4, rmcsAvg: 77.9, fitness: 85, matches: 94, cards: { yellow: 267, red: 13 }, varAccuracy: 90.8, varQualified: false, trend: -1.2, bio: { en: "Strong positioning scores, but his card count runs above the zone average under pressure.", fr: "Bonnes notes de placement, mais son total de cartons dépasse la moyenne de zone sous pression." } },
  { id: "patricia-banda", name: "Patricia Banda", initials: "PB", countryCode: "ZMB", city: "Lusaka", level: "FIFA Listed", age: 34, yearsActive: 11, status: "elite-pool", arps: 89.2, rmcsAvg: 86.8, fitness: 84, matches: 118, cards: { yellow: 331, red: 15 }, varAccuracy: 95.0, varQualified: true, trend: 2.7, bio: { en: "First southern-zone official shortlisted for CAF Elite promotion this cycle.", fr: "Première officielle de la zone australe retenue pour une promotion CAF Elite ce cycle." } },
  { id: "olivier-nkurunziza", name: "Olivier Nkurunziza", initials: "ON", countryCode: "BDI", city: "Bujumbura", level: "Regional", age: 26, yearsActive: 4, status: "training", arps: 73.9, rmcsAvg: 70.5, fitness: 92, matches: 38, cards: { yellow: 96, red: 4 }, varAccuracy: 88.2, varQualified: false, trend: 4.4, bio: { en: "On the CAF Academy accelerated track for 2026/27.", fr: "Inscrit au parcours accéléré de la CAF Academy pour 2026/27." } },
  { id: "khadija-el-amrani", name: "Khadija El Amrani", initials: "KE", countryCode: "MAR", city: "Casablanca", level: "CAF Elite", age: 36, yearsActive: 14, status: "elite-pool", arps: 92.7, rmcsAvg: 90.9, fitness: 81, matches: 187, cards: { yellow: 512, red: 21 }, varAccuracy: 97.3, varQualified: true, trend: 1.4, bio: { en: "Second-highest ARPS in North Africa; the standing choice for the Casablanca derby.", fr: "Deuxième meilleur ARPS d'Afrique du Nord ; le choix par défaut pour le derby de Casablanca." } },
  { id: "isaac-boateng", name: "Isaac Boateng", initials: "IB", countryCode: "GHA", city: "Takoradi", level: "National D1", age: 33, yearsActive: 10, status: "active", arps: 78.5, rmcsAvg: 75.2, fitness: 80, matches: 102, cards: { yellow: 289, red: 17 }, varAccuracy: 89.6, varQualified: false, trend: -2.4, bio: { en: "Card count trending above the zone average — flagged for a consistency review.", fr: "Total de cartons au-dessus de la moyenne de zone — signalé pour une revue de régularité." } },
  { id: "wanjiru-kamau", name: "Wanjiru Kamau", initials: "WK", countryCode: "KEN", city: "Nakuru", level: "FIFA Listed", age: 30, yearsActive: 7, status: "active", arps: 84.6, rmcsAvg: 81.9, fitness: 89, matches: 96, cards: { yellow: 251, red: 10 }, varAccuracy: 93.1, varQualified: true, trend: 3.6, bio: { en: "Fastest-rising score among FIFA-listed officials in East Africa.", fr: "Progression la plus rapide parmi les officiels FIFA d'Afrique de l'Est." } },
  { id: "abdoulaye-diallo", name: "Abdoulaye Diallo", initials: "AD", countryCode: "SEN", city: "Thiès", level: "CAF Elite", age: 37, yearsActive: 15, status: "active", arps: 90.8, rmcsAvg: 88.9, fitness: 77, matches: 203, cards: { yellow: 578, red: 24 }, varAccuracy: 96.2, varQualified: true, trend: 0.7, bio: { en: "The senior voice in the West African elite pool; mentors three academy candidates.", fr: "La voix expérimentée du groupe élite ouest-africain ; encadre trois candidats de l'académie." } },
  { id: "naledi-dube", name: "Naledi Dube", initials: "ND", countryCode: "ZWE", city: "Bulawayo", level: "Regional", age: 27, yearsActive: 5, status: "training", arps: 75.7, rmcsAvg: 72.3, fitness: 93, matches: 44, cards: { yellow: 121, red: 5 }, varAccuracy: 88.9, varQualified: false, trend: 6.5, bio: { en: "Climbing quickly since joining the southern development cohort.", fr: "Progresse vite depuis son entrée dans la promotion de développement australe." } },
  { id: "farid-benkirane", name: "Farid Benkirane", initials: "FB", countryCode: "DZA", city: "Algiers", level: "FIFA Listed", age: 34, yearsActive: 11, status: "active", arps: 87.9, rmcsAvg: 85.1, fitness: 83, matches: 148, cards: { yellow: 402, red: 19 }, varAccuracy: 94.5, varQualified: true, trend: 1.0, bio: { en: "High-volume official — three seasons running in the mid-nineties for review accuracy.", fr: "Officiel à fort volume — trois saisons de suite au-dessus de 94 % de justesse en revue." } },
  { id: "esther-nyambura", name: "Esther Nyambura", initials: "EN", countryCode: "UGA", city: "Kampala", level: "National D1", age: 28, yearsActive: 6, status: "active", arps: 79.3, rmcsAvg: 76.4, fitness: 88, matches: 68, cards: { yellow: 176, red: 7 }, varAccuracy: 90.5, varQualified: false, trend: 2.9, bio: { en: "Selected for the CAF Academy VAR bridge programme next quarter.", fr: "Sélectionnée pour le programme passerelle VAR de la CAF Academy le trimestre prochain." } },
  { id: "papy-tshimanga", name: "Papy Tshimanga", initials: "PT", countryCode: "COD", city: "Lubumbashi", level: "National D1", age: 33, yearsActive: 9, status: "active", arps: 81.8, rmcsAvg: 79.2, fitness: 86, matches: 104, cards: { yellow: 298, red: 14 }, varAccuracy: 91.2, varQualified: false, trend: 1.7, bio: { en: "Handles the Lubumbashi–Kinshasa fixtures nobody else in the corps wants.", fr: "Prend en charge les rencontres Lubumbashi–Kinshasa dont personne d'autre ne veut dans le corps arbitral." } },
  { id: "bernadette-kalonji", name: "Bernadette Kalonji", initials: "BK", countryCode: "COD", city: "Kinshasa", level: "FIFA Listed", age: 30, yearsActive: 8, status: "active", arps: 85.9, rmcsAvg: 83.4, fitness: 91, matches: 92, cards: { yellow: 241, red: 9 }, varAccuracy: 93.8, varQualified: true, trend: 4.1, bio: { en: "First Congolese official on the continental VAR roster.", fr: "Première officielle congolaise inscrite au registre VAR continental." } },
  { id: "helder-sambo", name: "Hélder Sambo", initials: "HS", countryCode: "AGO", city: "Luanda", level: "FIFA Listed", age: 35, yearsActive: 12, status: "active", arps: 86.7, rmcsAvg: 84.9, fitness: 82, matches: 151, cards: { yellow: 389, red: 16 }, varAccuracy: 94.1, varQualified: true, trend: 0.9, bio: { en: "The reference for Girabola title deciders; rarely needs a second look.", fr: "La référence sur les matchs décisifs du Girabola ; rarement besoin d'une seconde lecture." } },
  { id: "teresa-do-carmo", name: "Teresa do Carmo", initials: "TC", countryCode: "AGO", city: "Benguela", level: "National D1", age: 28, yearsActive: 5, status: "training", arps: 77.9, rmcsAvg: 74.6, fitness: 93, matches: 51, cards: { yellow: 132, red: 5 }, varAccuracy: 89.7, varQualified: false, trend: 5.2, bio: { en: "Quickest promotion through the Angolan grades in a decade.", fr: "Promotion la plus rapide dans les catégories angolaises depuis dix ans." } },
  { id: "mona-farouk", name: "Mona Farouk", initials: "MF", countryCode: "EGY", city: "Alexandria", level: "FIFA Listed", age: 32, yearsActive: 10, status: "active", arps: 88.4, rmcsAvg: 86.2, fitness: 89, matches: 127, cards: { yellow: 334, red: 12 }, varAccuracy: 95.6, varQualified: true, trend: 2.8, bio: { en: "Leads the Egyptian women's panel and covers men's top-flight VAR.", fr: "Dirige le panel féminin égyptien et couvre la VAR de première division masculine." } },
  { id: "anas-berrada", name: "Anas Berrada", initials: "AB", countryCode: "MAR", city: "Rabat", level: "FIFA Listed", age: 31, yearsActive: 9, status: "active", arps: 87.1, rmcsAvg: 85.5, fitness: 90, matches: 118, cards: { yellow: 305, red: 11 }, varAccuracy: 94.9, varQualified: true, trend: 3.1, bio: { en: "Rising quickly; the federation's first choice behind El Amrani.", fr: "En forte progression ; premier choix de la fédération derrière El Amrani." } },
  { id: "rania-gharbi", name: "Rania Gharbi", initials: "RG", countryCode: "TUN", city: "Sousse", level: "National D1", age: 29, yearsActive: 6, status: "active", arps: 82.4, rmcsAvg: 80.1, fitness: 92, matches: 74, cards: { yellow: 189, red: 6 }, varAccuracy: 92.0, varQualified: false, trend: 3.8, bio: { en: "Lowest card count per match in the Tunisian corps, two seasons running.", fr: "Plus faible ratio de cartons par match du corps tunisien, deux saisons de suite." } },
  { id: "sofiane-meziane", name: "Sofiane Meziane", initials: "SM", countryCode: "DZA", city: "Oran", level: "CAF Elite", age: 36, yearsActive: 14, status: "elite-pool", arps: 91.0, rmcsAvg: 89.3, fitness: 80, matches: 194, cards: { yellow: 521, red: 22 }, varAccuracy: 96.4, varQualified: true, trend: 1.2, bio: { en: "Algeria's senior elite official; assessor on the North African panel.", fr: "Officiel élite le plus expérimenté d'Algérie ; observateur du panel nord-africain." } },
  { id: "bongani-sithole", name: "Bongani Sithole", initials: "BS", countryCode: "ZAF", city: "Polokwane", level: "National D1", age: 33, yearsActive: 10, status: "active", arps: 83.2, rmcsAvg: 81.0, fitness: 87, matches: 113, cards: { yellow: 312, red: 13 }, varAccuracy: 92.6, varQualified: true, trend: 1.5, bio: { en: "Reliable in the Premiership's high-tempo mid-table fixtures.", fr: "Fiable sur les rencontres de milieu de tableau à haut rythme du championnat." } },
  { id: "chantal-petersen", name: "Chantal Petersen", initials: "CP", countryCode: "ZAF", city: "Cape Town", level: "Regional", age: 27, yearsActive: 4, status: "training", arps: 76.4, rmcsAvg: 73.1, fitness: 94, matches: 47, cards: { yellow: 118, red: 4 }, varAccuracy: 88.6, varQualified: false, trend: 6.9, bio: { en: "Best physical scores in the southern development cohort.", fr: "Meilleures notes physiques de la promotion de développement australe." } },
  { id: "juma-mwakalinga", name: "Juma Mwakalinga", initials: "JW", countryCode: "TZA", city: "Dar es Salaam", level: "FIFA Listed", age: 34, yearsActive: 11, status: "active", arps: 85.6, rmcsAvg: 83.8, fitness: 85, matches: 139, cards: { yellow: 361, red: 15 }, varAccuracy: 93.9, varQualified: true, trend: 1.8, bio: { en: "The Kariakoo derby's standing appointment for four seasons.", fr: "Désigné sur le derby de Kariakoo quatre saisons de suite." } },
  { id: "aurelie-ngo-bell", name: "Aurélie Ngo Bell", initials: "AN", countryCode: "CMR", city: "Yaoundé", level: "National D1", age: 31, yearsActive: 7, status: "active", arps: 82.0, rmcsAvg: 79.7, fitness: 89, matches: 83, cards: { yellow: 216, red: 8 }, varAccuracy: 91.8, varQualified: false, trend: 2.6, bio: { en: "Strongest game-management marks in the Central African cohort.", fr: "Meilleures notes de gestion de match de la promotion d'Afrique centrale." } },
  { id: "serge-kouassi", name: "Serge Kouassi", initials: "SK", countryCode: "CIV", city: "Bouaké", level: "FIFA Listed", age: 37, yearsActive: 13, status: "active", arps: 86.2, rmcsAvg: 84.4, fitness: 78, matches: 168, cards: { yellow: 442, red: 19 }, varAccuracy: 94.3, varQualified: true, trend: -0.8, bio: { en: "Vastly experienced, but his physical scores have slipped two seasons running.", fr: "Très expérimenté, mais ses notes physiques baissent depuis deux saisons." } },
  { id: "ifeoma-nwachukwu", name: "Ifeoma Nwachukwu", initials: "IN", countryCode: "NGA", city: "Port Harcourt", level: "Regional", age: 26, yearsActive: 3, status: "training", arps: 74.8, rmcsAvg: 71.6, fitness: 95, matches: 34, cards: { yellow: 88, red: 3 }, varAccuracy: 87.9, varQualified: false, trend: 7.4, bio: { en: "Fastest riser on the whole list this season.", fr: "Progression la plus rapide de toute la liste cette saison." } },
  { id: "ousmane-sangare", name: "Ousmane Sangaré", initials: "OS", countryCode: "MLI", city: "Ségou", level: "FIFA Listed", age: 32, yearsActive: 9, status: "active", arps: 84.1, rmcsAvg: 82.2, fitness: 88, matches: 106, cards: { yellow: 271, red: 10 }, varAccuracy: 93.2, varQualified: true, trend: 2.2, bio: { en: "Carries most of the Malian continental workload on his own.", fr: "Porte à lui seul l'essentiel de la charge continentale malienne." } },
  { id: "kagiso-molefe", name: "Kagiso Molefe", initials: "KM", countryCode: "BWA", city: "Francistown", level: "National D1", age: 30, yearsActive: 7, status: "active", arps: 79.9, rmcsAvg: 77.3, fitness: 90, matches: 78, cards: { yellow: 203, red: 9 }, varAccuracy: 90.9, varQualified: false, trend: 2.4, bio: { en: "Doubles as the Botswana federation's fitness instructor.", fr: "Également instructeur physique de la fédération botswanaise." } },
];

export const refereeById = new Map(referees.map((r) => [r.id, r]));

export function refereeCountry(referee: Referee) {
  return countryByCode.get(referee.countryCode)!;
}

/** Assistant referees and fourth officials — the wider list a federation draws on. */
export interface Assistant {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  level: "FIFA Listed" | "National D1" | "Regional";
  rating: number;
}

const assistantSeed: Array<[string, string[]]> = [
  ["EGY", ["Mahmoud Fathy", "Ahmed Ezzat", "Sherif Kamal", "Mostafa Hilal", "Nourhan Adel", "Tarek Selim"]],
  ["MAR", ["Lahcen Azgaou", "Yassine Berrada", "Mounir Sabbar", "Zineb Tazi", "Hamza Idrissi", "Salma Chraibi"]],
  ["TUN", ["Hichem Guirat", "Mehdi Jerbi", "Slim Chaouch", "Rania Belhaj", "Wassim Trabelsi", "Ines Ayari"]],
  ["DZA", ["Abdelhak Etchiali", "Mokhtar Zerhouni", "Sofiane Ait Idir", "Nadir Boukhalfa", "Lyes Hamadi"]],
  ["SEN", ["Djibril Camara", "Nogaye Ndiaye", "Ousmane Faye", "Mamadou Sow", "Awa Gueye"]],
  ["MLI", ["Bakary Sidibé", "Adama Coulibaly", "Fatoumata Keïta", "Modibo Diarra", "Aminata Touré"]],
  ["CIV", ["Konan Yao", "Aya Brou", "Ibrahim Ouattara", "Serge Gnahoré", "Mariam Bamba", "Yao Koffi"]],
  ["GHA", ["Kwaku Danso", "Abigail Aryee", "Yaw Owusu", "Kojo Amankwah", "Efua Boateng"]],
  ["NGA", ["Ifeanyi Nwosu", "Blessing Ekpo", "Tunde Salami", "Halima Bello", "Chukwuma Obi", "Yetunde Ajayi"]],
  ["CMR", ["Éric Ndoumbé", "Clarisse Etoa", "Landry Fotso", "Blaise Mbarga", "Sylvie Manga"]],
  ["COD", ["Papy Kabeya", "Josué Ilunga", "Espérance Mbaya", "Trésor Mukendi", "Nadine Bope"]],
  ["KEN", ["Peter Kimani", "Ruth Cherop", "Dennis Ochieng", "Joyce Wambui", "Victor Barasa"]],
  ["TZA", ["Frank Komba", "Neema Shirima", "Hassan Juma", "Baraka Mlele", "Zawadi Kessy"]],
  ["UGA", ["Ronald Kizito", "Sarah Nabbosa", "Ivan Muwanga", "Brian Ssentongo", "Grace Auma"]],
  ["BDI", ["Désiré Ndayishimiye", "Aline Niyonkuru", "Fabrice Bizimana", "Chantal Irakoze"]],
  ["ZAF", ["Sipho Radebe", "Zanele Mthembu", "Devon Adams", "Karabo Sithole", "Lerato Dlamini", "Wian Bekker"]],
  ["ZMB", ["Chanda Mwape", "Mutale Kunda", "Given Phiri", "Bwalya Musonda", "Naomi Zulu"]],
  ["ZWE", ["Tendai Moyo", "Rutendo Chikwanha", "Blessing Ncube", "Farai Mutasa", "Nyasha Gumbo"]],
  ["BWA", ["Kabelo Tau", "Onalenna Seleka", "Thabo Ramotswe", "Boitumelo Kgosi"]],
  ["AGO", ["Nelson Bengui", "Domingas Kiala", "Ruben Cabral", "Nito Fernandes", "Luisa Miguel"]],
];

export const assistants: Assistant[] = assistantSeed.flatMap(([code, names]) =>
  names.map((name, i) => ({
    id: `${code.toLowerCase()}-ar-${i + 1}`,
    name,
    initials: name
      .split(" ")
      .map((p) => p[0])
      .join(""),
    countryCode: code,
    level: (i === 0 ? "FIFA Listed" : i === 1 ? "National D1" : "Regional") as Assistant["level"],
    rating: 72 + ((name.length * 7 + i * 11) % 22),
  })),
);

export const assistantById = new Map(assistants.map((a) => [a.id, a]));

export interface OfficialRef {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  kind: "referee" | "assistant";
}

export function officialById(id: string): OfficialRef | undefined {
  const r = refereeById.get(id);
  if (r) return { id: r.id, name: r.name, initials: r.initials, countryCode: r.countryCode, kind: "referee" };
  const a = assistantById.get(id);
  if (a) return { id: a.id, name: a.name, initials: a.initials, countryCode: a.countryCode, kind: "assistant" };
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Fixture calendar — the country-by-country schedule ARIS syncs against
 * ------------------------------------------------------------------ */

export const roleKey: Record<CrewRole, "roles.R" | "roles.AR1" | "roles.AR2" | "roles.FOURTH" | "roles.VAR" | "roles.AVAR" | "roles.OBS"> = {
  R: "roles.R",
  AR1: "roles.AR1",
  AR2: "roles.AR2",
  FOURTH: "roles.FOURTH",
  VAR: "roles.VAR",
  AVAR: "roles.AVAR",
  OBS: "roles.OBS",
};

/** Deterministic PRNG — same seed, same calendar, every build. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** The three demo weeks: last week (played), this week, next week. */
export const weekStarts = [addDays(DEMO_TODAY, -7), DEMO_TODAY, addDays(DEMO_TODAY, 7)];

const venuesByCountry: Record<string, string[]> = {
  EGY: ["Cairo International Stadium", "Borg El Arab", "30 June Stadium"],
  MAR: ["Stade Mohammed V", "Complexe Moulay Abdellah", "Stade de Berkane"],
  TUN: ["Stade Hammadi Agrebi", "Stade Olympique de Sousse", "Stade Taïeb Mhiri"],
  DZA: ["Stade du 5 Juillet", "Stade Mustapha Tchaker", "Stade du 8 Mai 1945"],
  SEN: ["Stade Abdoulaye Wade", "Stade Lat Dior", "Stade Aline Sitoé Diatta"],
  MLI: ["Stade du 26 Mars", "Stade Modibo Keïta"],
  CIV: ["Stade Félix Houphouët-Boigny", "Stade Charles Konan Banny", "Stade de la Paix"],
  GHA: ["Baba Yara Stadium", "Accra Sports Stadium", "Cape Coast Stadium"],
  NGA: ["Enyimba International", "Moshood Abiola Stadium", "Nnamdi Azikiwe Stadium"],
  CMR: ["Stade Roumdé Adjia", "Stade de la Réunification", "Stade Ahmadou Ahidjo"],
  COD: ["Stade TP Mazembe", "Stade des Martyrs"],
  KEN: ["Nyayo National Stadium", "Kasarani Stadium", "Bukhungu Stadium"],
  TZA: ["Benjamin Mkapa Stadium", "Amaan Complex", "Sheikh Amri Abeid"],
  UGA: ["Mandela National Stadium", "St Mary's Kitende", "Lugogo"],
  BDI: ["Stade Intwari", "Stade Ingoma"],
  ZAF: ["Loftus Versfeld", "FNB Stadium", "Moses Mabhida", "Danie Craven"],
  ZMB: ["Levy Mwanawasa Stadium", "Arthur Davies Stadium", "National Heroes"],
  ZWE: ["Rufaro Stadium", "Barbourfields", "Mandava Stadium"],
  BWA: ["Obed Itani Chilume", "National Stadium Gaborone"],
  AGO: ["Estádio 11 de Novembro", "Estádio dos Coqueiros"],
};

const kickoffs = ["15:00", "16:00", "17:00", "19:00", "20:00", "21:00"];

function buildDomesticFixtures(): Fixture[] {
  const out: Fixture[] = [];

  competitions
    .filter((c) => c.tier === "d1")
    .forEach((comp) => {
      const country = countryByCode.get(comp.countryCode)!;
      const clubs = country.clubs;

      weekStarts.forEach((weekStart, weekIndex) => {
        const r = rng(hash(comp.id + weekStart));
        const count = clubs.length >= 5 ? 3 : 2;
        const used = new Set<string>();

        for (let i = 0; i < count; i++) {
          let home = clubs[Math.floor(r() * clubs.length)];
          let away = clubs[Math.floor(r() * clubs.length)];
          let guard = 0;
          while ((home === away || used.has(home) || used.has(away)) && guard < 25) {
            home = clubs[Math.floor(r() * clubs.length)];
            away = clubs[Math.floor(r() * clubs.length)];
            guard++;
          }
          if (home === away) continue;
          used.add(home);
          used.add(away);

          // Weekend-weighted: Friday to Sunday, with some leagues also playing
          // a midweek round.
          const midweek = i === 0 && weekIndex === 1 && r() > 0.6;
          const dayOffset = midweek ? 2 : 4 + Math.floor(r() * 3);
          const date = addDays(weekStart, dayOffset);
          const venues = venuesByCountry[comp.countryCode] ?? [country.capital];
          const isDerby = /derby/.test(home) || (used.size === 2 && r() > 0.72);
          const importance = Math.round(
            comp.weight * 0.55 + (isDerby ? 26 : 0) + r() * 18,
          );

          out.push({
            id: `${comp.id}-w${weekIndex}-${i}`,
            countryCode: comp.countryCode,
            competitionId: comp.id,
            matchday: comp.currentMatchday + weekIndex - 1,
            date,
            kickoff: kickoffs[Math.floor(r() * kickoffs.length)],
            home,
            away,
            city: country.capital,
            venue: venues[Math.floor(r() * venues.length)],
            importance: Math.min(97, importance),
            risk: importance > 74 ? "high" : importance > 58 ? "medium" : "low",
            crew: [],
            played: weekIndex === 0,
          });
        }
      });
    });

  return out;
}

const continentalTies: Array<{
  competitionId: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  venue: string;
  city: string;
  importance: number;
  weekIndex: number;
  dayOffset: number;
  kickoff: string;
}> = [
  { competitionId: "caf-cl", home: "Al Ahly", away: "Espérance de Tunis", homeCode: "EGY", awayCode: "TUN", venue: "Cairo International Stadium", city: "Cairo", importance: 97, weekIndex: 1, dayOffset: 5, kickoff: "20:00" },
  { competitionId: "caf-cl", home: "Mamelodi Sundowns", away: "Wydad AC", homeCode: "ZAF", awayCode: "MAR", venue: "Loftus Versfeld", city: "Pretoria", importance: 91, weekIndex: 1, dayOffset: 5, kickoff: "18:00" },
  { competitionId: "caf-cl", home: "TP Mazembe", away: "Petro de Luanda", homeCode: "COD", awayCode: "AGO", venue: "Stade TP Mazembe", city: "Lubumbashi", importance: 84, weekIndex: 2, dayOffset: 2, kickoff: "19:00" },
  { competitionId: "caf-cc", home: "Simba SC", away: "ASEC Mimosas", homeCode: "TZA", awayCode: "CIV", venue: "Benjamin Mkapa Stadium", city: "Dar es Salaam", importance: 79, weekIndex: 1, dayOffset: 6, kickoff: "17:00" },
  { competitionId: "caf-cc", home: "ZESCO United", away: "Enyimba FC", homeCode: "ZMB", awayCode: "NGA", venue: "Levy Mwanawasa Stadium", city: "Ndola", importance: 74, weekIndex: 2, dayOffset: 5, kickoff: "15:00" },
  { competitionId: "afcon-q", home: "Nigeria", away: "Cameroon", homeCode: "NGA", awayCode: "CMR", venue: "Moshood Abiola Stadium", city: "Abuja", importance: 95, weekIndex: 1, dayOffset: 6, kickoff: "17:00" },
  { competitionId: "afcon-q", home: "Senegal", away: "Algeria", homeCode: "SEN", awayCode: "DZA", venue: "Stade Abdoulaye Wade", city: "Dakar", importance: 93, weekIndex: 2, dayOffset: 4, kickoff: "19:00" },
  { competitionId: "afcon-q", home: "Kenya", away: "Zambia", homeCode: "KEN", awayCode: "ZMB", venue: "Kasarani Stadium", city: "Nairobi", importance: 81, weekIndex: 0, dayOffset: 5, kickoff: "16:00" },
  { competitionId: "cafwcl", home: "Mamelodi Sundowns Ladies", away: "AS FAR Women", homeCode: "ZAF", awayCode: "MAR", venue: "FNB Stadium", city: "Johannesburg", importance: 78, weekIndex: 1, dayOffset: 4, kickoff: "15:00" },
  { competitionId: "cafwcl", home: "Huracanes FC", away: "Rivers Angels", homeCode: "GHA", awayCode: "NGA", venue: "Accra Sports Stadium", city: "Accra", importance: 69, weekIndex: 2, dayOffset: 5, kickoff: "16:00" },
];

/** Clubs a fixture belongs to, used for the neutrality check. */
export const fixtureNations = new Map<string, string[]>();

function buildContinentalFixtures(): Fixture[] {
  return continentalTies.map((tie, i) => {
    const comp = competitionById.get(tie.competitionId)!;
    const id = `${tie.competitionId}-tie-${i}`;
    fixtureNations.set(id, [tie.homeCode, tie.awayCode]);
    return {
      id,
      countryCode: "CAF",
      competitionId: tie.competitionId,
      matchday: comp.currentMatchday,
      date: addDays(weekStarts[tie.weekIndex], tie.dayOffset),
      kickoff: tie.kickoff,
      home: tie.home,
      away: tie.away,
      city: tie.city,
      venue: tie.venue,
      importance: tie.importance,
      risk: tie.importance > 88 ? "high" : "medium",
      crew: [],
      played: tie.weekIndex === 0,
    };
  });
}

function crewShapeFor(fixture: Fixture): CrewRole[] {
  const comp = competitionById.get(fixture.competitionId)!;
  const base: CrewRole[] = ["R", "AR1", "AR2", "FOURTH"];
  if (comp.varEnabled) base.push("VAR", "AVAR");
  if (fixture.importance >= 70) base.push("OBS");
  return base;
}

/** Roles that must be filled before a fixture counts as covered. */
export function requiredRoles(fixture: Fixture): CrewRole[] {
  return crewShapeFor(fixture).filter((role) => role !== "OBS");
}

/** Officials a fixture may legally use: never from a country taking part. */
export function eligibleNations(fixture: Fixture): (code: string) => boolean {
  if (fixture.countryCode !== "CAF") {
    // Domestic fixture — staffed by that country's own list.
    return (code) => code === fixture.countryCode;
  }
  const involved = fixtureNations.get(fixture.id) ?? [];
  return (code) => !involved.includes(code);
}

function buildCrews(list: Fixture[]): Fixture[] {
  return list.map((fixture) => {
    const r = rng(hash(fixture.id + "crew"));
    const shape = crewShapeFor(fixture);
    const isEligible = eligibleNations(fixture);

    const refereePool = referees.filter(
      (ref) => ref.status !== "suspended" && isEligible(ref.countryCode),
    );
    const assistantPool = assistants.filter((a) => isEligible(a.countryCode));

    // Continental ties draw on the whole continent; domestic ties on the
    // home list, which is exactly where the thin countries show gaps.
    // Filled in order, keeping track of who is already on the crew — an
    // assignor would pick someone else on a clash, not leave the slot blank.
    const used = new Set<string>();

    const crew: CrewSlot[] = shape.map((role) => {
      const wantsReferee = role === "R" || role === "VAR" || role === "AVAR" || role === "OBS";
      const source: Array<{ id: string }> = wantsReferee ? refereePool : assistantPool;
      const pool = source.filter((candidate) => !used.has(candidate.id));

      if (pool.length === 0) return { role, officialId: null, state: "empty" };

      // Deliberate holes, weighted by how hard the role is to fill. A demo week
      // has to show real work left over without looking abandoned.
      // An observer is either appointed to a fixture or the fixture has no
      // observer slot at all — a half-appointed observer is not a real state,
      // and showing one as "missing" buries the slots that do need chasing.
      const emptyChance = fixture.played
        ? 0
        : role === "OBS"
          ? 0
          : role === "R"
            ? 0.05
            : role === "VAR" || role === "AVAR"
              ? 0.12
              : 0.08;
      if (r() < emptyChance) return { role, officialId: null, state: "empty" };

      const pick = pool[Math.floor(r() * pool.length)];
      used.add(pick.id);
      const roll = r();
      const state: SlotState = fixture.played
        ? "confirmed"
        : roll > 0.8
          ? "pending"
          : roll > 0.77
            ? "declined"
            : "confirmed";
      return { role, officialId: pick.id, state };
    });

    return { ...fixture, crew };
  });
}

export const fixtures: Fixture[] = buildCrews([
  ...buildDomesticFixtures(),
  ...buildContinentalFixtures(),
]).sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date)));

export const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

export function openSlots(fixture: Fixture) {
  return fixture.crew.filter(
    (s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined"),
  ).length;
}

export function crewIsComplete(fixture: Fixture) {
  return fixture.crew.every(
    (s) => s.role === "OBS" || s.state === "confirmed" || s.state === "pending",
  );
}

export function fixturesInWeek(weekStart: string) {
  const end = addDays(weekStart, 6);
  return fixtures.filter((f) => f.date >= weekStart && f.date <= end);
}

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

/** Set only in the live build; the demo derives availability deterministically instead. */
let liveAvailability: Map<string, AvailabilityState> | null = null;

/** Declared availability, derived deterministically per official and day. */
export function availabilityFor(officialId: string, date: string): AvailabilityState {
  const assignedHere = fixtures.some(
    (f) => f.date === date && f.crew.some((s) => s.officialId === officialId && s.state !== "empty"),
  );
  if (assignedHere) return "assigned";

  // Live data: what the official declared, otherwise available — nothing is invented.
  if (liveAvailability) return liveAvailability.get(`${officialId}|${date}`) ?? "available";

  const r = rng(hash(officialId + date));
  const roll = r();
  if (roll > 0.88) return "unavailable";
  if (roll > 0.8) return "travelling";
  if (roll > 0.72) return "resting";
  return "available";
}

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Days since this official's last appointment before `date`. */
export function restDays(officialId: string, date: string) {
  const past = fixtures
    .filter((f) => f.date < date && f.crew.some((s) => s.officialId === officialId))
    .map((f) => f.date)
    .sort();
  const last = past[past.length - 1];
  return last ? daysBetween(last, date) : 14;
}

/* ------------------------------------------------------------------ *
 * Played matches, decisions, observer reports
 * ------------------------------------------------------------------ */

export interface MatchDecision {
  id: string;
  minute: number;
  type: "Penalty" | "Red Card" | "Yellow Card" | "Offside" | "Handball" | "Foul";
  description: { en: string; fr: string };
  initialCall: "given" | "not-given";
  varReview: boolean;
  finalCall: "confirmed" | "overturned";
  confidence: number;
  pressureIndex: number;
  /** Referee's distance from the incident, in metres. */
  distance: number;
  players: string[];
}

export interface MatchRecord {
  id: string;
  home: string;
  away: string;
  competitionId: string;
  countryCode: string;
  date: string;
  score: string;
  refereeId: string;
  arpsForMatch: number;
  rmcs: number;
  pressureAvg: number;
  physical: {
    distanceKm: number;
    sprints: number;
    topSpeed: number;
    avgDistanceToBall: number;
    diagonalAdherence: number;
  };
  decisions: MatchDecision[];
  pressureTimeline: { minute: number; pressure: number }[];
}

function timeline(peak: number) {
  return [0, 10, 20, 30, 40, 45, 55, 60, 70, 80, 90].map((minute, i) => ({
    minute,
    pressure: Math.round(18 + (peak - 18) * (i / 10) + Math.sin(i * 1.7) * 5),
  }));
}

export const matches: MatchRecord[] = [
  {
    id: "m-2026-0826",
    home: "Al Ahly",
    away: "Espérance de Tunis",
    competitionId: "caf-cl",
    countryCode: "CAF",
    date: "2026-08-26",
    score: "2 - 1",
    refereeId: "karim-haddad",
    arpsForMatch: 91.8,
    rmcs: 94.2,
    pressureAvg: 71,
    physical: { distanceKm: 11.4, sprints: 34, topSpeed: 23.9, avgDistanceToBall: 17.2, diagonalAdherence: 82 },
    decisions: [
      { id: "d1", minute: 12, type: "Yellow Card", description: { en: "Reckless tackle, studs showing, middle third.", fr: "Tacle imprudent, crampons apparents, dans l'entrejeu." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 98, pressureIndex: 34, distance: 9, players: ["#6 Fathi", "#8 Ben Romdhane"] },
      { id: "d2", minute: 27, type: "Penalty", description: { en: "Contact in the box on a corner delivery.", fr: "Contact dans la surface sur un corner." }, initialCall: "not-given", varReview: true, finalCall: "overturned", confidence: 91, pressureIndex: 58, distance: 21, players: ["#9 Sherif", "#4 Meriah"] },
      { id: "d3", minute: 39, type: "Offside", description: { en: "Tight offside on the second phase of a counter.", fr: "Hors-jeu serré sur la deuxième phase d'un contre." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 99, pressureIndex: 44, distance: 26, players: ["#11 Kahraba"] },
      { id: "d4", minute: 58, type: "Red Card", description: { en: "Denial of an obvious goal-scoring opportunity.", fr: "Annihilation d'une occasion de but manifeste." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 96, pressureIndex: 82, distance: 12, players: ["#5 Dhaouadi"] },
      { id: "d5", minute: 71, type: "Handball", description: { en: "Ball strikes an arm away from the body, inside the area.", fr: "Ballon sur un bras décollé du corps, dans la surface." }, initialCall: "not-given", varReview: true, finalCall: "confirmed", confidence: 88, pressureIndex: 76, distance: 18, players: ["#3 Maaloul"] },
      { id: "d6", minute: 84, type: "Foul", description: { en: "Late challenge by the technical area at high tempo.", fr: "Faute en retard près de la zone technique, à haut rythme." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 93, pressureIndex: 89, distance: 7, players: ["#17 Dieng"] },
    ],
    pressureTimeline: timeline(94),
  },
  {
    id: "m-2026-0829",
    home: "Kenya",
    away: "Zambia",
    competitionId: "afcon-q",
    countryCode: "CAF",
    date: "2026-08-29",
    score: "1 - 1",
    refereeId: "amina-kone",
    arpsForMatch: 93.9,
    rmcs: 95.1,
    pressureAvg: 74,
    physical: { distanceKm: 12.1, sprints: 41, topSpeed: 25.4, avgDistanceToBall: 15.8, diagonalAdherence: 88 },
    decisions: [
      { id: "d1", minute: 15, type: "Handball", description: { en: "Deliberate handball clearing a corner.", fr: "Main volontaire pour dégager un corner." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 97, pressureIndex: 45, distance: 11, players: ["#4 Omollo"] },
      { id: "d2", minute: 24, type: "Foul", description: { en: "High-tempo challenge in the middle third.", fr: "Duel à haute intensité dans l'entrejeu." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 92, pressureIndex: 52, distance: 8, players: ["#8 Sakala"] },
      { id: "d3", minute: 41, type: "Penalty", description: { en: "Shirt-pull inside the area at a set piece.", fr: "Maillot tiré dans la surface sur coup de pied arrêté." }, initialCall: "not-given", varReview: true, finalCall: "confirmed", confidence: 89, pressureIndex: 63, distance: 19, players: ["#19 Olunga", "#4 Mwepu"] },
      { id: "d4", minute: 63, type: "Red Card", description: { en: "Second caution, reckless late tackle.", fr: "Deuxième avertissement, tacle imprudent en retard." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 98, pressureIndex: 85, distance: 6, players: ["#6 Wanyama"] },
      { id: "d5", minute: 77, type: "Offside", description: { en: "Tight offside on a counter-attacking through ball.", fr: "Hors-jeu serré sur une ouverture en contre." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 99, pressureIndex: 88, distance: 31, players: ["#10 Daka"] },
    ],
    pressureTimeline: timeline(96),
  },
  {
    id: "m-2026-0828",
    home: "Kaizer Chiefs",
    away: "Orlando Pirates",
    competitionId: "zaf-d1",
    countryCode: "ZAF",
    date: "2026-08-28",
    score: "2 - 2",
    refereeId: "thabo-nkosi",
    arpsForMatch: 88.6,
    rmcs: 90.0,
    pressureAvg: 79,
    physical: { distanceKm: 11.9, sprints: 38, topSpeed: 24.6, avgDistanceToBall: 16.4, diagonalAdherence: 79 },
    decisions: [
      { id: "d1", minute: 6, type: "Yellow Card", description: { en: "Early derby tone-setter, reckless challenge.", fr: "Premier duel imprudent, qui donne le ton du derby." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 96, pressureIndex: 55, distance: 10, players: ["#22 Ntsabeleng"] },
      { id: "d2", minute: 29, type: "Penalty", description: { en: "Handball inside the area under pressure.", fr: "Main dans la surface sous pression." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 93, pressureIndex: 71, distance: 16, players: ["#5 Mabaso"] },
      { id: "d3", minute: 47, type: "Foul", description: { en: "Off-the-ball incident missed on the field.", fr: "Incident loin du ballon, non vu sur le terrain." }, initialCall: "not-given", varReview: true, finalCall: "confirmed", confidence: 85, pressureIndex: 80, distance: 34, players: ["#9 Mabasa"] },
      { id: "d4", minute: 69, type: "Red Card", description: { en: "Violent conduct after a heavy tackle exchange.", fr: "Comportement violent après un échange de tacles appuyés." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 97, pressureIndex: 93, distance: 5, players: ["#14 Sirino"] },
      { id: "d5", minute: 85, type: "Offside", description: { en: "Marginal offside ruling out a late equaliser.", fr: "Hors-jeu millimétré qui annule une égalisation tardive." }, initialCall: "given", varReview: true, finalCall: "overturned", confidence: 91, pressureIndex: 95, distance: 28, players: ["#11 Zwane"] },
    ],
    pressureTimeline: timeline(98),
  },
  {
    id: "m-2026-0827",
    home: "Raja Casablanca",
    away: "RS Berkane",
    competitionId: "mar-d1",
    countryCode: "MAR",
    date: "2026-08-27",
    score: "3 - 1",
    refereeId: "khadija-el-amrani",
    arpsForMatch: 90.5,
    rmcs: 91.8,
    pressureAvg: 58,
    physical: { distanceKm: 10.8, sprints: 29, topSpeed: 22.8, avgDistanceToBall: 18.1, diagonalAdherence: 86 },
    decisions: [
      { id: "d1", minute: 18, type: "Foul", description: { en: "Tactical foul stopping a promising attack.", fr: "Faute tactique qui stoppe une attaque prometteuse." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 95, pressureIndex: 38, distance: 12, players: ["#6 El Kaabi"] },
      { id: "d2", minute: 37, type: "Yellow Card", description: { en: "Simulation inside the penalty area.", fr: "Simulation dans la surface de réparation." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 92, pressureIndex: 47, distance: 14, players: ["#10 Bencharki"] },
      { id: "d3", minute: 54, type: "Penalty", description: { en: "Clear trip on a one-on-one chance.", fr: "Croc-en-jambe évident sur un face-à-face." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 98, pressureIndex: 60, distance: 9, players: ["#9 Moutaraji"] },
      { id: "d4", minute: 79, type: "Offside", description: { en: "Tight offside on a rebound goal.", fr: "Hors-jeu serré sur un but en second ballon." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 97, pressureIndex: 55, distance: 24, players: ["#7 Fajr"] },
    ],
    pressureTimeline: timeline(69),
  },
  {
    id: "m-2026-0825",
    home: "Simba SC",
    away: "Young Africans SC",
    competitionId: "tza-d1",
    countryCode: "TZA",
    date: "2026-08-25",
    score: "0 - 0",
    refereeId: "wanjiru-kamau",
    arpsForMatch: 85.2,
    rmcs: 84.0,
    pressureAvg: 68,
    physical: { distanceKm: 11.1, sprints: 31, topSpeed: 23.2, avgDistanceToBall: 17.9, diagonalAdherence: 74 },
    decisions: [
      { id: "d1", minute: 22, type: "Handball", description: { en: "Ball strikes an arm in a blocking position.", fr: "Ballon sur un bras en position de blocage." }, initialCall: "not-given", varReview: false, finalCall: "confirmed", confidence: 86, pressureIndex: 49, distance: 22, players: ["#3 Kabaso"] },
      { id: "d2", minute: 40, type: "Yellow Card", description: { en: "Delaying the restart after losing possession.", fr: "Retard à la remise en jeu après une perte de balle." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 95, pressureIndex: 55, distance: 13, players: ["#8 Chama"] },
      { id: "d3", minute: 61, type: "Penalty", description: { en: "Foul in a corner-kick scramble.", fr: "Faute dans une mêlée sur corner." }, initialCall: "given", varReview: false, finalCall: "overturned", confidence: 71, pressureIndex: 72, distance: 20, players: ["#19 Meschack"] },
      { id: "d4", minute: 83, type: "Red Card", description: { en: "Serious foul play endangering an opponent.", fr: "Faute grossière mettant en danger un adversaire." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 94, pressureIndex: 84, distance: 8, players: ["#15 Yondjouck"] },
    ],
    pressureTimeline: timeline(86),
  },
  {
    id: "m-2026-0824",
    home: "Enyimba FC",
    away: "Rivers United",
    competitionId: "nga-d1",
    countryCode: "NGA",
    date: "2026-08-24",
    score: "1 - 0",
    refereeId: "chidinma-okafor",
    arpsForMatch: 87.4,
    rmcs: 86.1,
    pressureAvg: 62,
    physical: { distanceKm: 11.6, sprints: 36, topSpeed: 24.1, avgDistanceToBall: 16.9, diagonalAdherence: 84 },
    decisions: [
      { id: "d1", minute: 9, type: "Foul", description: { en: "Cynical foul breaking up a fast transition.", fr: "Faute cynique qui casse une transition rapide." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 94, pressureIndex: 30, distance: 11, players: ["#14 Eze"] },
      { id: "d2", minute: 34, type: "Yellow Card", description: { en: "Persistent dissent toward the assistant.", fr: "Contestation répétée envers l'assistant." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 97, pressureIndex: 44, distance: 15, players: ["#7 Bature"] },
      { id: "d3", minute: 58, type: "Penalty", description: { en: "Trip inside the area on a driving run.", fr: "Croc-en-jambe dans la surface sur une percée." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 90, pressureIndex: 67, distance: 13, players: ["#9 Anaemena"] },
      { id: "d4", minute: 88, type: "Yellow Card", description: { en: "Time-wasting at a late substitution.", fr: "Perte de temps lors d'un changement tardif." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 96, pressureIndex: 78, distance: 10, players: ["#2 Ogbu"] },
    ],
    pressureTimeline: timeline(82),
  },
  {
    id: "m-2026-0830",
    home: "Wydad AC",
    away: "AS FAR",
    competitionId: "mar-d1",
    countryCode: "MAR",
    date: "2026-08-30",
    score: "1 - 2",
    refereeId: "anas-berrada",
    arpsForMatch: 86.9,
    rmcs: 85.4,
    pressureAvg: 70,
    physical: { distanceKm: 11.7, sprints: 37, topSpeed: 24.8, avgDistanceToBall: 16.1, diagonalAdherence: 87 },
    decisions: [
      { id: "d1", minute: 11, type: "Yellow Card", description: { en: "Shirt-pull stopping a break at the halfway line.", fr: "Maillot tiré pour stopper une percée au milieu." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 96, pressureIndex: 32, distance: 9, players: ["#8 Rahimi"] },
      { id: "d2", minute: 44, type: "Penalty", description: { en: "Goalkeeper clips the striker after the ball has gone.", fr: "Le gardien accroche l'attaquant après que le ballon soit parti." }, initialCall: "not-given", varReview: true, finalCall: "overturned", confidence: 87, pressureIndex: 66, distance: 23, players: ["#1 Tagnaouti", "#11 Moufi"] },
      { id: "d3", minute: 67, type: "Offside", description: { en: "Second-phase offside from a corner clearance.", fr: "Hors-jeu de deuxième phase après un dégagement de corner." }, initialCall: "not-given", varReview: true, finalCall: "confirmed", confidence: 95, pressureIndex: 74, distance: 27, players: ["#9 El Amloud"] },
      { id: "d4", minute: 88, type: "Red Card", description: { en: "Second caution for dissent after the winning goal.", fr: "Second avertissement pour contestation après le but victorieux." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 94, pressureIndex: 91, distance: 6, players: ["#4 Jabrane"] },
    ],
    pressureTimeline: timeline(93),
  },
  {
    id: "m-2026-0829b",
    home: "Gor Mahia",
    away: "Tusker FC",
    competitionId: "ken-d1",
    countryCode: "KEN",
    date: "2026-08-29",
    score: "2 - 0",
    refereeId: "grace-mutua",
    arpsForMatch: 82.7,
    rmcs: 80.9,
    pressureAvg: 55,
    physical: { distanceKm: 10.6, sprints: 27, topSpeed: 22.4, avgDistanceToBall: 18.6, diagonalAdherence: 76 },
    decisions: [
      { id: "d1", minute: 19, type: "Foul", description: { en: "Late challenge on the touchline, no card warranted.", fr: "Faute en retard sur la touche, sans carton." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 93, pressureIndex: 28, distance: 14, players: ["#6 Otieno"] },
      { id: "d2", minute: 52, type: "Handball", description: { en: "Arm away from the body blocking a cross.", fr: "Bras décollé du corps qui bloque un centre." }, initialCall: "given", varReview: false, finalCall: "overturned", confidence: 68, pressureIndex: 61, distance: 25, players: ["#3 Wanyama"] },
      { id: "d3", minute: 74, type: "Yellow Card", description: { en: "Persistent infringement, third foul by the same player.", fr: "Infractions répétées, troisième faute du même joueur." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 97, pressureIndex: 63, distance: 11, players: ["#14 Kimani"] },
    ],
    pressureTimeline: timeline(72),
  },
  {
    id: "m-2026-0828b",
    home: "TP Mazembe",
    away: "AS Vita Club",
    competitionId: "cod-d1",
    countryCode: "COD",
    date: "2026-08-28",
    score: "3 - 2",
    refereeId: "papy-tshimanga",
    arpsForMatch: 80.4,
    rmcs: 78.8,
    pressureAvg: 83,
    physical: { distanceKm: 11.2, sprints: 33, topSpeed: 23.5, avgDistanceToBall: 19.4, diagonalAdherence: 71 },
    decisions: [
      { id: "d1", minute: 14, type: "Yellow Card", description: { en: "Retaliation after an off-the-ball shove.", fr: "Riposte après une bousculade loin du ballon." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 91, pressureIndex: 48, distance: 17, players: ["#5 Kabaso"] },
      { id: "d2", minute: 38, type: "Penalty", description: { en: "Trip in the area, given from a poor angle.", fr: "Croc-en-jambe dans la surface, accordé depuis un mauvais angle." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 74, pressureIndex: 77, distance: 29, players: ["#10 Meschack"] },
      { id: "d3", minute: 59, type: "Foul", description: { en: "Missed foul in the build-up to the third goal.", fr: "Faute non vue dans la construction du troisième but." }, initialCall: "not-given", varReview: false, finalCall: "overturned", confidence: 62, pressureIndex: 88, distance: 33, players: ["#7 Ilunga"] },
      { id: "d4", minute: 81, type: "Red Card", description: { en: "Serious foul play on a counter-attack.", fr: "Faute grossière sur un contre." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 92, pressureIndex: 94, distance: 8, players: ["#2 Mbaya"] },
    ],
    pressureTimeline: timeline(97),
  },
  {
    id: "m-2026-0827b",
    home: "Petro de Luanda",
    away: "1º de Agosto",
    competitionId: "ago-d1",
    countryCode: "AGO",
    date: "2026-08-27",
    score: "0 - 1",
    refereeId: "helder-sambo",
    arpsForMatch: 88.1,
    rmcs: 87.0,
    pressureAvg: 64,
    physical: { distanceKm: 11.0, sprints: 30, topSpeed: 23.1, avgDistanceToBall: 16.7, diagonalAdherence: 85 },
    decisions: [
      { id: "d1", minute: 23, type: "Foul", description: { en: "Tactical foul stopping the counter, correctly cautioned.", fr: "Faute tactique sur le contre, avertissement justifié." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 96, pressureIndex: 41, distance: 10, players: ["#8 Zito"] },
      { id: "d2", minute: 49, type: "Offside", description: { en: "Marginal offside ruling out the opener.", fr: "Hors-jeu millimétré qui annule l'ouverture du score." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 90, pressureIndex: 68, distance: 21, players: ["#9 Depú"] },
      { id: "d3", minute: 71, type: "Yellow Card", description: { en: "Dissent from the bench, formal caution issued.", fr: "Contestation depuis le banc, avertissement formel." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 98, pressureIndex: 72, distance: 5, players: ["Bench"] },
    ],
    pressureTimeline: timeline(80),
  },
  {
    id: "m-2026-0826b",
    home: "Espérance de Tunis",
    away: "Étoile du Sahel",
    competitionId: "tun-d1",
    countryCode: "TUN",
    date: "2026-08-26",
    score: "2 - 2",
    refereeId: "youssef-ben-ali",
    arpsForMatch: 89.3,
    rmcs: 90.1,
    pressureAvg: 76,
    physical: { distanceKm: 10.4, sprints: 25, topSpeed: 21.8, avgDistanceToBall: 18.9, diagonalAdherence: 81 },
    decisions: [
      { id: "d1", minute: 17, type: "Penalty", description: { en: "Clear push at a corner, given without hesitation.", fr: "Poussée évidente sur corner, accordée sans hésitation." }, initialCall: "given", varReview: true, finalCall: "confirmed", confidence: 95, pressureIndex: 52, distance: 12, players: ["#4 Meriah"] },
      { id: "d2", minute: 45, type: "Yellow Card", description: { en: "Time-wasting on the stroke of half time.", fr: "Perte de temps juste avant la mi-temps." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 97, pressureIndex: 58, distance: 9, players: ["#1 Ben Cherifia"] },
      { id: "d3", minute: 63, type: "Handball", description: { en: "Ball onto the arm from close range, no offence.", fr: "Ballon sur le bras à courte distance, pas de faute." }, initialCall: "not-given", varReview: true, finalCall: "confirmed", confidence: 89, pressureIndex: 79, distance: 16, players: ["#6 Ben Romdhane"] },
      { id: "d4", minute: 90, type: "Foul", description: { en: "Free kick awarded in a dangerous position at the death.", fr: "Coup franc accordé en position dangereuse dans les arrêts de jeu." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 88, pressureIndex: 96, distance: 13, players: ["#3 Chaouat"] },
    ],
    pressureTimeline: timeline(95),
  },
  {
    id: "m-2026-0825b",
    home: "Asante Kotoko",
    away: "Hearts of Oak",
    competitionId: "gha-d1",
    countryCode: "GHA",
    date: "2026-08-25",
    score: "1 - 1",
    refereeId: "samuel-asante",
    arpsForMatch: 84.5,
    rmcs: 83.2,
    pressureAvg: 81,
    physical: { distanceKm: 11.8, sprints: 39, topSpeed: 24.3, avgDistanceToBall: 15.9, diagonalAdherence: 83 },
    decisions: [
      { id: "d1", minute: 8, type: "Yellow Card", description: { en: "Studs-up challenge in the opening exchanges.", fr: "Tacle crampons en avant dès les premiers échanges." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 95, pressureIndex: 57, distance: 8, players: ["#16 Danso"] },
      { id: "d2", minute: 33, type: "Penalty", description: { en: "Appeal for a hold at a set piece, waved away.", fr: "Réclamation pour un maillot tenu sur coup de pied arrêté, refusée." }, initialCall: "not-given", varReview: false, finalCall: "confirmed", confidence: 81, pressureIndex: 70, distance: 18, players: ["#5 Owusu"] },
      { id: "d3", minute: 61, type: "Foul", description: { en: "Advantage played, then brought back for the caution.", fr: "Avantage laissé, puis retour en arrière pour l'avertissement." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 92, pressureIndex: 76, distance: 12, players: ["#11 Mensah"] },
      { id: "d4", minute: 86, type: "Red Card", description: { en: "Violent conduct in a crowded penalty area.", fr: "Comportement violent dans une surface encombrée." }, initialCall: "given", varReview: false, finalCall: "confirmed", confidence: 90, pressureIndex: 95, distance: 15, players: ["#19 Boakye"] },
    ],
    pressureTimeline: timeline(96),
  },
];

export const matchById = new Map(matches.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ *
 * Observer reports
 * ------------------------------------------------------------------ */

export interface Assessment {
  id: string;
  matchId: string;
  refereeId: string;
  observerId: string;
  state: "filed" | "draft" | "overdue";
  filedHoursAfter: number | null;
  overall: number;
  marks: {
    positioning: number;
    decisions: number;
    gameManagement: number;
    teamwork: number;
    discipline: number;
    fitness: number;
  };
  notes: { en: string; fr: string };
  clips: { minute: number; label: { en: string; fr: string } }[];
}

export const assessments: Assessment[] = [
  {
    id: "as-1",
    matchId: "m-2026-0826",
    refereeId: "karim-haddad",
    observerId: "jean-baptiste-mbida",
    state: "filed",
    filedHoursAfter: 19,
    overall: 8.6,
    marks: { positioning: 8.4, decisions: 8.9, gameManagement: 8.8, teamwork: 8.7, discipline: 8.3, fitness: 7.9 },
    notes: {
      en: "Read the tempo well and let a physical tie breathe. The penalty at 27' was the right outcome but arrived late — he was 21 m away and screened by two bodies. Physical output tailed off in the final twenty minutes.",
      fr: "Bonne lecture du rythme, il a laissé respirer une rencontre engagée. Le penalty de la 27e est la bonne issue mais arrive tard — il était à 21 m, la vue masquée par deux joueurs. Le rendement physique baisse dans les vingt dernières minutes.",
    },
    clips: [
      { minute: 27, label: { en: "Penalty — angle of view", fr: "Penalty — angle de vue" } },
      { minute: 58, label: { en: "Red card — positioning", fr: "Carton rouge — placement" } },
      { minute: 84, label: { en: "Late foul — game management", fr: "Faute tardive — gestion" } },
    ],
  },
  {
    id: "as-2",
    matchId: "m-2026-0829",
    refereeId: "amina-kone",
    observerId: "abdoulaye-diallo",
    state: "filed",
    filedHoursAfter: 11,
    overall: 9.1,
    marks: { positioning: 9.2, decisions: 9.3, gameManagement: 9.0, teamwork: 9.1, discipline: 8.8, fitness: 9.2 },
    notes: {
      en: "A controlled performance in a hostile qualifier. Kept the diagonal at 88 % and was inside 20 m for every reviewable call. The second caution at 63' was unavoidable and correctly sold to both benches.",
      fr: "Prestation maîtrisée dans un qualificatif hostile. Diagonale tenue à 88 % et présence à moins de 20 m sur chaque décision analysable. Le second avertissement à la 63e était inévitable et bien expliqué aux deux bancs.",
    },
    clips: [
      { minute: 41, label: { en: "Penalty — VAR intervention", fr: "Penalty — intervention VAR" } },
      { minute: 63, label: { en: "Second caution", fr: "Second avertissement" } },
    ],
  },
  {
    id: "as-3",
    matchId: "m-2026-0828",
    refereeId: "thabo-nkosi",
    observerId: "patricia-banda",
    state: "filed",
    filedHoursAfter: 41,
    overall: 7.8,
    marks: { positioning: 7.4, decisions: 8.1, gameManagement: 7.6, teamwork: 8.2, discipline: 7.5, fitness: 8.4 },
    notes: {
      en: "Handled a derby that never settled. The 47' off-the-ball incident was missed live — he was on the far touchline and had turned with play. Diagonal adherence dropped to 79 %, which is where the misses came from.",
      fr: "A tenu un derby qui n'est jamais retombé. L'incident loin du ballon à la 47e n'a pas été vu en direct — il était sur la touche opposée et avait suivi le jeu. La diagonale tombe à 79 %, c'est de là que viennent les oublis.",
    },
    clips: [
      { minute: 47, label: { en: "Off-the-ball incident", fr: "Incident loin du ballon" } },
      { minute: 85, label: { en: "Offside — final call", fr: "Hors-jeu — décision finale" } },
    ],
  },
  {
    id: "as-4",
    matchId: "m-2026-0827",
    refereeId: "khadija-el-amrani",
    observerId: "youssef-ben-ali",
    state: "filed",
    filedHoursAfter: 14,
    overall: 8.8,
    marks: { positioning: 9.0, decisions: 8.9, gameManagement: 8.9, teamwork: 8.6, discipline: 8.7, fitness: 8.2 },
    notes: {
      en: "Economical, unshowy, and never behind play. The simulation caution at 37' was brave and correct. Nothing to correct beyond a slightly slow restart management in the second half.",
      fr: "Sobre, économe, jamais en retard sur le jeu. L'avertissement pour simulation à la 37e est courageux et juste. Rien à corriger, hormis une gestion des reprises un peu lente en seconde période.",
    },
    clips: [{ minute: 37, label: { en: "Simulation caution", fr: "Avertissement pour simulation" } }],
  },
  {
    id: "as-5",
    matchId: "m-2026-0825",
    refereeId: "wanjiru-kamau",
    observerId: "jean-baptiste-mbida",
    state: "overdue",
    filedHoursAfter: null,
    overall: 0,
    marks: { positioning: 0, decisions: 0, gameManagement: 0, teamwork: 0, discipline: 0, fitness: 0 },
    notes: { en: "", fr: "" },
    clips: [],
  },
  {
    id: "as-6",
    matchId: "m-2026-0824",
    refereeId: "chidinma-okafor",
    observerId: "abdoulaye-diallo",
    state: "draft",
    filedHoursAfter: null,
    overall: 8.2,
    marks: { positioning: 8.3, decisions: 8.4, gameManagement: 8.0, teamwork: 8.1, discipline: 8.2, fitness: 8.5 },
    notes: {
      en: "Draft — awaiting the clip references before filing. Strong first half, one soft caution at 88' that the match did not need.",
      fr: "Brouillon — en attente des séquences avant dépôt. Bonne première période, un avertissement léger à la 88e dont le match n'avait pas besoin.",
    },
    clips: [],
  },
  {
    id: "as-7",
    matchId: "m-2026-0830",
    refereeId: "anas-berrada",
    observerId: "khadija-el-amrani",
    state: "filed",
    filedHoursAfter: 16,
    overall: 8.4,
    marks: { positioning: 8.7, decisions: 8.1, gameManagement: 8.5, teamwork: 8.6, discipline: 8.3, fitness: 8.9 },
    notes: {
      en: "The penalty at 44' was missed live from 23 m with the goalkeeper's body in the way; the VAR call was correct and quick. Everything after that was managed calmly, including a hostile finish.",
      fr: "Le penalty de la 44e n'a pas été vu en direct, à 23 m et le corps du gardien dans l'axe ; l'intervention VAR est juste et rapide. Tout le reste est géré avec calme, y compris une fin de match hostile.",
    },
    clips: [
      { minute: 44, label: { en: "Penalty — line of sight", fr: "Penalty — ligne de vue" } },
      { minute: 88, label: { en: "Second caution", fr: "Second avertissement" } },
    ],
  },
  {
    id: "as-8",
    matchId: "m-2026-0828b",
    refereeId: "papy-tshimanga",
    observerId: "jean-baptiste-mbida",
    state: "filed",
    filedHoursAfter: 44,
    overall: 6.9,
    marks: { positioning: 6.2, decisions: 6.8, gameManagement: 7.1, teamwork: 7.4, discipline: 7.0, fitness: 7.2 },
    notes: {
      en: "Two of the three key incidents were judged from beyond 29 m, and diagonal adherence fell to 71 %. The 59' foul in the build-up to the third goal should have been seen. Recommend a positioning module before the next continental appointment.",
      fr: "Deux des trois faits de jeu majeurs ont été jugés à plus de 29 m, et la diagonale tombe à 71 %. La faute de la 59e dans la construction du troisième but aurait dû être vue. Un module de placement est recommandé avant la prochaine désignation continentale.",
    },
    clips: [
      { minute: 38, label: { en: "Penalty — distance to play", fr: "Penalty — distance au jeu" } },
      { minute: 59, label: { en: "Missed foul in the build-up", fr: "Faute non vue dans la construction" } },
    ],
  },
  {
    id: "as-9",
    matchId: "m-2026-0827b",
    refereeId: "helder-sambo",
    observerId: "patricia-banda",
    state: "filed",
    filedHoursAfter: 9,
    overall: 8.9,
    marks: { positioning: 9.1, decisions: 8.8, gameManagement: 9.0, teamwork: 8.8, discipline: 8.9, fitness: 8.4 },
    notes: {
      en: "A quiet, controlled performance: three decisions, all correct, none contested for long. The bench caution at 71' defused the only flashpoint of the night.",
      fr: "Prestation calme et maîtrisée : trois décisions, toutes justes, aucune contestée longtemps. L'avertissement au banc à la 71e désamorce le seul point de tension de la soirée.",
    },
    clips: [{ minute: 49, label: { en: "Offside — disallowed goal", fr: "Hors-jeu — but refusé" } }],
  },
  {
    id: "as-10",
    matchId: "m-2026-0826b",
    refereeId: "youssef-ben-ali",
    observerId: "sofiane-meziane",
    state: "filed",
    filedHoursAfter: 22,
    overall: 8.5,
    marks: { positioning: 7.9, decisions: 9.0, gameManagement: 8.8, teamwork: 8.7, discipline: 8.6, fitness: 7.4 },
    notes: {
      en: "Decision-making remains the best in the zone. Physical output is the concern: 10.4 km and 25 sprints are both below his own three-season average, and he was 16 m away on the 63' handball.",
      fr: "La prise de décision reste la meilleure de la zone. Le point de vigilance est physique : 10,4 km et 25 sprints, tous deux sous sa moyenne des trois dernières saisons, et il était à 16 m sur la main de la 63e.",
    },
    clips: [
      { minute: 17, label: { en: "Penalty — confirmed on review", fr: "Penalty — confirmé en revue" } },
      { minute: 63, label: { en: "Handball — no offence", fr: "Main — pas de faute" } },
    ],
  },
  {
    id: "as-11",
    matchId: "m-2026-0825b",
    refereeId: "samuel-asante",
    observerId: "abdoulaye-diallo",
    state: "filed",
    filedHoursAfter: 31,
    overall: 8.0,
    marks: { positioning: 8.2, decisions: 7.8, gameManagement: 8.1, teamwork: 8.0, discipline: 7.6, fitness: 8.5 },
    notes: {
      en: "Held a derby that stayed on the edge all evening. The 33' penalty appeal was a defensible no-call at 18 m. The red card at 86' was late but unavoidable once seen.",
      fr: "A tenu un derby resté sous tension toute la soirée. La réclamation de penalty à la 33e est un non-coup de sifflet défendable à 18 m. Le carton rouge de la 86e arrive tard mais devient inévitable une fois vu.",
    },
    clips: [
      { minute: 33, label: { en: "Penalty appeal — no call", fr: "Réclamation de penalty — pas de sifflet" } },
      { minute: 86, label: { en: "Violent conduct", fr: "Comportement violent" } },
    ],
  },
  {
    id: "as-12",
    matchId: "m-2026-0829b",
    refereeId: "grace-mutua",
    observerId: "wanjiru-kamau",
    state: "draft",
    filedHoursAfter: null,
    overall: 7.5,
    marks: { positioning: 7.0, decisions: 7.2, gameManagement: 7.8, teamwork: 7.9, discipline: 7.7, fitness: 7.4 },
    notes: {
      en: "Draft. The 52' handball was given from 25 m and overturned on review — the clip is the whole conversation for the debrief.",
      fr: "Brouillon. La main de la 52e est sifflée à 25 m puis annulée en revue — cette séquence résume tout le débriefing.",
    },
    clips: [],
  },
];

export const assessmentByMatch = new Map(assessments.map((a) => [a.matchId, a]));

/* ------------------------------------------------------------------ *
 * Licences, fitness, courses
 * ------------------------------------------------------------------ */

export interface Licence {
  id: string;
  refereeId: string;
  kind: "FIFA Badge" | "CAF Elite Panel" | "National D1" | "VAR Certification" | "Fitness Clearance";
  issued: string;
  expires: string;
}

function licencesFor(referee: Referee): Licence[] {
  const r = rng(hash(referee.id + "lic"));
  const out: Licence[] = [];
  const base: Licence["kind"][] = ["National D1"];
  if (referee.level === "FIFA Listed" || referee.level === "CAF Elite") base.push("FIFA Badge");
  if (referee.level === "CAF Elite") base.push("CAF Elite Panel");
  if (referee.varQualified) base.push("VAR Certification");
  base.push("Fitness Clearance");

  base.forEach((kind, i) => {
    // Spread expiries so the compliance view has real work in it.
    const daysOut = Math.round(r() * 420) - 30;
    out.push({
      id: `${referee.id}-lic-${i}`,
      refereeId: referee.id,
      kind,
      issued: addDays(DEMO_TODAY, daysOut - 365),
      expires: addDays(DEMO_TODAY, daysOut),
    });
  });
  return out;
}

export const licences: Licence[] = referees.flatMap(licencesFor);

export function licenceStatus(licence: Licence) {
  const days = daysBetween(DEMO_TODAY, licence.expires);
  if (days < 0) return { state: "expired" as const, days };
  if (days <= 90) return { state: "expiring" as const, days };
  return { state: "valid" as const, days };
}

export interface FitnessTest {
  refereeId: string;
  date: string;
  test1: { result: "passed" | "failed"; bestSprint: number };
  test2: { result: "passed" | "failed"; laps: number };
  retestDate: string | null;
}

export const fitnessTests: FitnessTest[] = referees.map((referee) => {
  const r = rng(hash(referee.id + "fit"));
  const strong = referee.fitness >= 82;
  const test1Pass = strong || r() > 0.35;
  const test2Pass = strong || r() > 0.45;
  const date = addDays(DEMO_TODAY, -Math.round(r() * 150) - 10);
  return {
    refereeId: referee.id,
    date,
    test1: { result: test1Pass ? "passed" : "failed", bestSprint: Math.round((5.7 + (100 - referee.fitness) * 0.012) * 100) / 100 },
    test2: { result: test2Pass ? "passed" : "failed", laps: test2Pass ? 40 + Math.round(r() * 8) : 26 + Math.round(r() * 10) },
    retestDate: test1Pass && test2Pass ? null : addDays(DEMO_TODAY, 12 + Math.round(r() * 25)),
  };
});

export const fitnessByReferee = new Map(fitnessTests.map((f) => [f.refereeId, f]));

export interface Course {
  id: string;
  name: { en: string; fr: string };
  provider: string;
  hours: number;
  refereeIds: string[];
  state: "enrolled" | "completed" | "not-started";
}

export const courses: Course[] = [
  { id: "c1", name: { en: "VAR protocol — practical module", fr: "Protocole VAR — module pratique" }, provider: "CAF Academy", hours: 32, refereeIds: ["esther-nyambura", "brian-otieno", "grace-mutua"], state: "enrolled" },
  { id: "c2", name: { en: "Managing the derby", fr: "Gérer le derby" }, provider: "CAF Academy", hours: 12, refereeIds: ["thabo-nkosi", "samuel-asante", "moussa-traore"], state: "enrolled" },
  { id: "c3", name: { en: "Laws of the Game update 2026/27", fr: "Mise à jour des Lois du Jeu 2026/27" }, provider: "FIFA", hours: 8, refereeIds: referees.map((r) => r.id), state: "completed" },
  { id: "c4", name: { en: "Handball interpretation workshop", fr: "Atelier d'interprétation des mains" }, provider: "CAF Academy", hours: 6, refereeIds: ["isaac-boateng", "naledi-dube", "olivier-nkurunziza", "aisha-mwangi"], state: "enrolled" },
  { id: "c5", name: { en: "Communication with benches and captains", fr: "Communication avec les bancs et les capitaines" }, provider: "Federation programme", hours: 10, refereeIds: ["ngozi-adeyemi", "lesedi-modise"], state: "not-started" },
];

/** What stands between a referee and the next level up. */
export function progressionFor(referee: Referee) {
  const fitness = fitnessByReferee.get(referee.id)!;
  const refLicences = licences.filter((l) => l.refereeId === referee.id);
  const varLicence = refLicences.find((l) => l.kind === "VAR Certification");
  const observerMarks = assessments.filter((a) => a.refereeId === referee.id && a.state === "filed");
  const next: Record<RefereeLevel, RefereeLevel | null> = {
    Regional: "National D1",
    "National D1": "FIFA Listed",
    "FIFA Listed": "CAF Elite",
    "CAF Elite": null,
  };
  return {
    nextLevel: next[referee.level],
    requirements: [
      { id: "arps", label: { en: "ARPS at or above 85", fr: "ARPS supérieur ou égal à 85" }, met: referee.arps >= 85, value: referee.arps.toFixed(1) },
      { id: "fitness", label: { en: "Current fitness test passed", fr: "Test physique en cours validé" }, met: fitness.test1.result === "passed" && fitness.test2.result === "passed", value: fitness.test1.result === "passed" && fitness.test2.result === "passed" ? "OK" : "—" },
      { id: "var", label: { en: "VAR certification held", fr: "Certification VAR détenue" }, met: Boolean(varLicence), value: varLicence ? varLicence.expires : "—" },
      { id: "observer", label: { en: "Three filed observer reports", fr: "Trois rapports d'observateur déposés" }, met: observerMarks.length >= 3, value: `${observerMarks.length}/3` },
      { id: "matches", label: { en: "80 matches at current level", fr: "80 rencontres au niveau actuel" }, met: referee.matches >= 80, value: String(referee.matches) },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Derived analytics
 * ------------------------------------------------------------------ */

export function getSubIndices(referee: Referee) {
  const clamp = (n: number) => Math.max(55, Math.min(99, Math.round(n * 10) / 10));
  return {
    ras: clamp(referee.varAccuracy - 2),
    cei: clamp(100 - referee.cards.red * 1.1),
    mds: clamp(referee.rmcsAvg + 1.5),
    prs: clamp(referee.fitness * 0.55 + referee.arps * 0.45),
    ci: clamp(100 - Math.abs(referee.trend) * 3.2),
  };
}

export const arpsTrend = [
  { month: "Mar", score: 80.1 },
  { month: "Apr", score: 81.0 },
  { month: "May", score: 81.8 },
  { month: "Jun", score: 82.6 },
  { month: "Jul", score: 83.4 },
  { month: "Aug", score: 84.6 },
];

export const decisionsBreakdown = [
  { id: "correct", value: 82 },
  { id: "correct-var", value: 12 },
  { id: "overturned", value: 4 },
  { id: "missed", value: 2 },
];

export interface RankingRow {
  rank: number;
  refereeId: string;
  name: string;
  countryCode: string;
  zone: Zone;
  level: RefereeLevel;
  arps: number;
  matches: number;
  delta: number;
}

export function rankingsFor(codes: string[]): RankingRow[] {
  const set = new Set(codes);
  return referees
    .filter((r) => set.has(r.countryCode))
    .slice()
    .sort((a, b) => b.arps - a.arps)
    .map((r, i) => ({
      rank: i + 1,
      refereeId: r.id,
      name: r.name,
      countryCode: r.countryCode,
      zone: countryByCode.get(r.countryCode)!.zone,
      level: r.level,
      arps: r.arps,
      matches: r.matches,
      delta: r.trend,
    }));
}

export interface FederationRow {
  code: string;
  countryCode: string;
  zone: Zone;
  refereeCount: number;
  eliteCount: number;
  avgArps: number;
  competitions: number;
  fixtures: number;
  openSlots: number;
  syncHealth: SyncHealth;
  syncSource: Country["syncSource"];
  lastSyncHours: number;
}

function computeFederationRows(): FederationRow[] {
  return countries.map((country) => {
    const corps = referees.filter((r) => r.countryCode === country.code);
    const countryFixtures = fixtures.filter((f) => f.countryCode === country.code);
    return {
      code: country.federation,
      countryCode: country.code,
      zone: country.zone,
      refereeCount: corps.length,
      eliteCount: corps.filter((r) => r.level === "CAF Elite").length,
      avgArps: corps.length
        ? Math.round((corps.reduce((s, r) => s + r.arps, 0) / corps.length) * 10) / 10
        : 0,
      competitions: competitions.filter((c) => c.countryCode === country.code).length,
      fixtures: countryFixtures.length,
      openSlots: countryFixtures.reduce((s, f) => s + openSlots(f), 0),
      syncHealth: country.syncHealth,
      syncSource: country.syncSource,
      lastSyncHours: country.lastSyncHours,
    };
  });
}

export const federationRows: FederationRow[] = computeFederationRows();

function computeZoneDistribution() {
  return zones.map((zone) => {
    const zoneCountries = countries.filter((c) => c.zone === zone);
    const corps = referees.filter((r) => zoneCountries.some((c) => c.code === r.countryCode));
    return {
      zone,
      referees: corps.length,
      avgArps: corps.length
        ? Math.round((corps.reduce((s, r) => s + r.arps, 0) / corps.length) * 10) / 10
        : 0,
      countries: zoneCountries.length,
    };
  });
}

export const zoneDistribution = computeZoneDistribution();

/* ------------------------------------------------------------------ *
 * Positioning
 * ------------------------------------------------------------------ */

/** Presence samples in metres on a 105 × 68 pitch, matching `Pitch.tsx`. */
export function heatPointsFor(matchId: string) {
  const r = rng(hash(matchId + "heat"));
  const round = (n: number) => Math.round(n * 100) / 100;
  // Three uniforms summed approximate a bell, which gives the diagonal a real
  // ridge — a single uniform draws a flat band with no shape to read.
  const bell = () => (r() + r() + r() - 1.5) / 1.5;
  return Array.from({ length: 420 }, () => {
    // Referees hold the left-back-to-right-back diagonal.
    const x = Math.max(1.5, Math.min(103.5, r() * 105));
    const y = Math.max(2, Math.min(66, 10 + (x / 105) * 48 + bell() * 13));
    return { x: round(x), y: round(y), intensity: round(0.35 + r() * 0.65) };
  });
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export interface Notification {
  id: string;
  title: { en: string; fr: string };
  detail: { en: string; fr: string };
  time: { en: string; fr: string };
  tone: "pitch" | "amber" | "red" | "var";
  read: boolean;
  href: string;
}

export const notifications: Notification[] = [
  {
    id: "n1",
    title: { en: "Crew still open — CAF Champions League", fr: "Trio incomplet — Ligue des champions CAF" },
    detail: { en: "Al Ahly vs Espérance de Tunis kicks off in 4 days with two slots empty.", fr: "Al Ahly – Espérance de Tunis se joue dans 4 jours avec deux postes vides." },
    time: { en: "8 min ago", fr: "il y a 8 min" },
    tone: "red",
    read: false,
    href: "/calendar",
  },
  {
    id: "n2",
    title: { en: "Observer report overdue", fr: "Rapport d'observateur en retard" },
    detail: { en: "Simba SC vs Young Africans SC — filed 0 of 48 hours after kick-off.", fr: "Simba SC – Young Africans SC — non déposé dans les 48 heures." },
    time: { en: "1 hour ago", fr: "il y a 1 heure" },
    tone: "amber",
    read: false,
    href: "/assessments",
  },
  {
    id: "n3",
    title: { en: "Licence renewals due", fr: "Licences à renouveler" },
    detail: { en: "Nine licences across four federations expire inside 90 days.", fr: "Neuf licences dans quatre fédérations expirent sous 90 jours." },
    time: { en: "3 hours ago", fr: "il y a 3 heures" },
    tone: "amber",
    read: false,
    href: "/development",
  },
  {
    id: "n4",
    title: { en: "Calendar feed stale", fr: "Flux calendrier obsolète" },
    detail: { en: "Mali and Zimbabwe have not synced in over 48 hours.", fr: "Le Mali et le Zimbabwe n'ont pas synchronisé depuis plus de 48 heures." },
    time: { en: "Yesterday", fr: "hier" },
    tone: "var",
    read: true,
    href: "/federations",
  },
  {
    id: "n5",
    title: { en: "Disciplinary review opened", fr: "Procédure disciplinaire ouverte" },
    detail: { en: "Emmanuel Mensah removed from the appointment list pending review.", fr: "Emmanuel Mensah retiré des désignations dans l'attente de la revue." },
    time: { en: "2 days ago", fr: "il y a 2 jours" },
    tone: "red",
    read: true,
    href: "/referees/emmanuel-mensah",
  },
];

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export interface Dossier {
  id: string;
  matchId: string;
  generated: string;
  pages: number;
  recipients: string[];
}

/* ------------------------------------------------------------------ *
 * Workload — the fairness question every appointments committee gets asked
 * ------------------------------------------------------------------ */

export interface WorkloadRow {
  officialId: string;
  name: string;
  countryCode: string;
  kind: "referee" | "assistant";
  appointments: number;
  asReferee: number;
  lastDate: string | null;
  /** Days between now and the next appointment; null when none is booked. */
  nextInDays: number | null;
}

/**
 * Appointments per official across the three demo weeks. Over-use and idleness
 * are both problems: one burns an official out, the other is how a federation
 * quietly loses people.
 */
export function workloadFor(codes: string[]): WorkloadRow[] {
  const set = new Set(codes);
  const rows = new Map<string, WorkloadRow>();

  const seed = (id: string, name: string, countryCode: string, kind: "referee" | "assistant") => {
    if (!set.has(countryCode)) return;
    rows.set(id, {
      officialId: id,
      name,
      countryCode,
      kind,
      appointments: 0,
      asReferee: 0,
      lastDate: null,
      nextInDays: null,
    });
  };

  referees.forEach((r) => seed(r.id, r.name, r.countryCode, "referee"));
  assistants.forEach((a) => seed(a.id, a.name, a.countryCode, "assistant"));

  fixtures.forEach((fixture) => {
    fixture.crew.forEach((slot) => {
      if (!slot.officialId || slot.state === "empty") return;
      const row = rows.get(slot.officialId);
      if (!row) return;
      row.appointments += 1;
      if (slot.role === "R") row.asReferee += 1;
      if (fixture.played && (!row.lastDate || fixture.date > row.lastDate)) row.lastDate = fixture.date;
      if (!fixture.played) {
        const days = daysBetween(DEMO_TODAY, fixture.date);
        if (days >= 0 && (row.nextInDays === null || days < row.nextInDays)) row.nextInDays = days;
      }
    });
  });

  return [...rows.values()].sort((a, b) => b.appointments - a.appointments);
}

export const WORKLOAD_HEAVY = 4;

export const dossiers: Dossier[] = [
  { id: "dos-1", matchId: "m-2026-0826", generated: addDays(DEMO_TODAY, -3), pages: 14, recipients: ["CAF referees department", "EFA"] },
  { id: "dos-2", matchId: "m-2026-0828", generated: addDays(DEMO_TODAY, -4), pages: 11, recipients: ["SAFA"] },
  { id: "dos-3", matchId: "m-2026-0827", generated: addDays(DEMO_TODAY, -5), pages: 12, recipients: ["FRMF", "Khadija El Amrani"] },
  { id: "dos-4", matchId: "m-2026-0829", generated: addDays(DEMO_TODAY, -1), pages: 16, recipients: ["CAF referees department"] },
  { id: "dos-5", matchId: "m-2026-0830", generated: addDays(DEMO_TODAY, -2), pages: 13, recipients: ["FRMF", "Anas Berrada"] },
  { id: "dos-6", matchId: "m-2026-0828b", generated: addDays(DEMO_TODAY, -6), pages: 18, recipients: ["FECOFA", "CAF referees department"] },
  { id: "dos-7", matchId: "m-2026-0826b", generated: addDays(DEMO_TODAY, -7), pages: 12, recipients: ["FTF"] },
  { id: "dos-8", matchId: "m-2026-0825b", generated: addDays(DEMO_TODAY, -9), pages: 15, recipients: ["GFA", "Samuel Asante"] },
];

/* ------------------------------------------------------------------ *
 * Continental headline numbers
 * ------------------------------------------------------------------ */

export const kpis = {
  refereesTracked: referees.length,
  assistantsTracked: assistants.length,
  federations: countries.length,
  competitions: competitions.length,
  avgArps: Math.round((referees.reduce((s, r) => s + r.arps, 0) / referees.length) * 10) / 10,
  avgArpsTrend: 1.8,
  decisionsReviewed: matches.reduce((s, m) => s + m.decisions.length, 0) * 2214,
  varAccuracy: 94.7,
};

/* ------------------------------------------------------------------ *
 * Live data
 *
 * The screens read the exported collections above. In the Cloudflare build the
 * Worker's snapshot replaces their contents *in place*, so every import keeps
 * working and nothing downstream has to know where the data came from.
 * ------------------------------------------------------------------ */

type ApiSnapshotFixture = Fixture & { homeCode?: string | null; awayCode?: string | null; designationStatus?: string };

export interface ApiSnapshot {
  today: string;
  countries: Country[];
  competitions: Competition[];
  referees: Referee[];
  assistants: Assistant[];
  fixtures: ApiSnapshotFixture[];
  matches: Array<Omit<MatchRecord, "physical" | "pressureTimeline"> & Partial<Pick<MatchRecord, "physical" | "pressureTimeline">>>;
  assessments: Assessment[];
  licences: Licence[];
  fitnessTests: FitnessTest[];
  courses: Course[];
  dossiers: Dossier[];
  availability: Array<{ officialId: string; date: string; state: AvailabilityState }>;
}

function replaceAll<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next);
}

function replaceMap<K, V>(target: Map<K, V>, entries: Iterable<[K, V]>) {
  target.clear();
  for (const [k, v] of entries) target.set(k, v);
}

function mondayOf(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

const EMPTY_PHYSICAL: MatchRecord["physical"] = { distanceKm: 0, sprints: 0, topSpeed: 0, avgDistanceToBall: 0, diagonalAdherence: 0 };

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : 0);

/** Swap the demo data for what the Worker returned. Call before the screens render. */
export function applySnapshot(s: ApiSnapshot) {
  DEMO_TODAY = s.today;
  replaceAll(weekStarts, [addDays(mondayOf(s.today), -7), mondayOf(s.today), addDays(mondayOf(s.today), 7)]);

  replaceAll(countries, s.countries);
  replaceMap(countryByCode, countries.map((c) => [c.code, c]));
  replaceAll(competitions, s.competitions);
  replaceMap(competitionById, competitions.map((c) => [c.id, c]));
  replaceAll(referees, s.referees);
  replaceMap(refereeById, referees.map((r) => [r.id, r]));
  replaceAll(assistants, s.assistants);
  replaceMap(assistantById, assistants.map((a) => [a.id, a]));

  fixtureNations.clear();
  const live = s.fixtures.map((f): Fixture => {
    if (f.homeCode && f.awayCode) fixtureNations.set(f.id, [f.homeCode, f.awayCode]);
    return {
      id: f.id,
      countryCode: f.countryCode,
      competitionId: f.competitionId,
      matchday: f.matchday,
      date: f.date,
      kickoff: f.kickoff,
      home: f.home,
      away: f.away,
      city: f.city,
      venue: f.venue,
      importance: f.importance,
      risk: f.risk,
      crew: f.crew,
      played: f.played,
    };
  });
  replaceAll(fixtures, live.sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date))));
  replaceMap(fixtureById, fixtures.map((f) => [f.id, f]));

  liveAvailability = new Map(s.availability.map((a) => [`${a.officialId}|${a.date}`, a.state]));

  replaceAll(
    matches,
    s.matches.map((m) => ({
      ...m,
      physical: m.physical && "distanceKm" in m.physical ? m.physical : EMPTY_PHYSICAL,
      pressureTimeline: m.pressureTimeline ?? [],
    })),
  );
  replaceMap(matchById, matches.map((m) => [m.id, m]));
  replaceAll(assessments, s.assessments);
  replaceMap(assessmentByMatch, assessments.map((a) => [a.matchId, a]));
  // licences are tracked for referees; assistants' are managed in the back office
  replaceAll(licences, s.licences.filter((l) => refereeById.has(l.refereeId)));
  replaceAll(fitnessTests, s.fitnessTests.filter((f) => refereeById.has(f.refereeId)));
  replaceMap(fitnessByReferee, fitnessTests.map((f) => [f.refereeId, f]));
  replaceAll(courses, s.courses);
  replaceAll(dossiers, s.dossiers);

  replaceAll(federationRows, computeFederationRows());
  replaceAll(zoneDistribution, computeZoneDistribution());
  Object.assign(kpis, {
    refereesTracked: referees.length,
    assistantsTracked: assistants.length,
    federations: countries.length,
    competitions: competitions.length,
    avgArps: mean(referees.map((r) => r.arps)),
    // no history feeds the trend or the VAR figure yet — shown from live referee records
    avgArpsTrend: 0,
    decisionsReviewed: matches.reduce((n, m) => n + m.decisions.length, 0),
    varAccuracy: mean(referees.filter((r) => r.varQualified).map((r) => r.varAccuracy)),
  });
}

/** Live build: reflect a slot change the Worker accepted, so every screen sees it. */
export function patchFixtureCrew(fixtureId: string, crew: CrewSlot[]) {
  const fixture = fixtureById.get(fixtureId);
  if (!fixture) return;
  fixture.crew = crew;
  replaceAll(federationRows, computeFederationRows());
}
