// Facts about the three federations ARIS is deployed for — Senegal, Côte d'Ivoire and the Republic of the Congo —
// as researched on 2026-10-24 from public sources (FIFA associations pages, federation sites, APS, RSSSF, the
// FECOFOOT Ligue 1 regulations, stadium pages). Clubs are the 2026/27 top-flight line-ups: the 2025/26 table minus
// the relegated clubs, plus the promoted ones.
//
// Only institutions and places live here. People are never listed, except in REAL_OFFICIALS, which exists so the
// generator in ./demo-data.ts can make sure no generated (fictional) official carries a real referee's name.
//
// Where a source did not give a figure (a capacity, a ground), the field is null or the nearest documented venue is
// used, and the comment says so.

import type { Zone } from "@core/types";

export interface ClubFact {
  name: string;
  /** The short form the press uses; null where none is established. */
  short: string | null;
  city: string;
  /** The ground the club plays its home matches at this season. */
  stadium: string;
  /** A club that draws crowds and the federation's best officials. */
  big?: boolean;
}

export interface StadiumFact {
  name: string;
  city: string;
  capacity: number | null;
}

export interface CountryFact {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  flag: string;
  zone: Zone;
  capital: string;
  timezone: string;
  currency: string;
  federation: { code: string; name: string };
  /** The federation body that runs refereeing, as it is called locally. */
  refereesCommittee: string;
  /** How ARIS gets the fixture list: the league's own feed, or the federation typing it in. */
  syncSource: "COMET" | "League feed" | "Manual entry";
  league: { name: string; shortName: string; varEnabled: boolean; clubs: ClubFact[] };
  cup: { name: string; shortName: string };
  stadiums: StadiumFact[];
  nationalStadium: string;
  /** Local kick-off times the league uses. */
  kickoffs: string[];
  derbies: Array<[string, string]>;
  /** The clubs entered in the CAF interclub competitions for 2026/27. */
  continental: { championsLeague: string[]; confederationCup: string[] };
  /** Where the federation's officials live. */
  officialCities: string[];
  /** Common given names and surnames, for generating fictional officials. */
  names: { male: string[]; female: string[]; surnames: string[] };
}

/* ------------------------------------------------------------------ *
 * Senegal — FSF, league run by the LSFP
 * ------------------------------------------------------------------ */

const SEN: CountryFact = {
  code: "SEN",
  iso2: "SN",
  name: "Senegal",
  nameFr: "Sénégal",
  nameEs: "Senegal",
  nameDe: "Senegal",
  flag: "🇸🇳",
  zone: "UFOA-A",
  capital: "Dakar",
  timezone: "Africa/Dakar",
  currency: "XOF",
  federation: { code: "FSF", name: "Fédération Sénégalaise de Football" },
  refereesCommittee: "Commission centrale des arbitres de la FSF",
  syncSource: "League feed",
  league: {
    name: "Ligue 1 Sénégal",
    shortName: "Ligue 1",
    varEnabled: false,
    clubs: [
      // 2025/26 champions (3rd title) — CAF Champions League 2026/27
      { name: "Teungueth FC", short: "TFC", city: "Rufisque", stadium: "Stade Ngalandou Diouf", big: true },
      { name: "AJEL de Rufisque", short: "AJEL", city: "Rufisque", stadium: "Stade Ngalandou Diouf", big: true },
      { name: "Génération Foot", short: "GF", city: "Déni Biram Ndao", stadium: "Stade Djibril Diagne", big: true },
      { name: "US Gorée", short: "USG", city: "Dakar", stadium: "Stade municipal de Ngor" },
      { name: "Wally Daan FC", short: null, city: "Thiès", stadium: "Stade Lat-Dior" },
      { name: "US Ouakam", short: "USO", city: "Dakar", stadium: "Stade municipal de Ngor" },
      { name: "ASC Jaraaf", short: null, city: "Dakar", stadium: "Stade Léopold Sédar Senghor", big: true },
      { name: "Casa Sports", short: null, city: "Ziguinchor", stadium: "Stade Aline Sitoé Diatta", big: true },
      { name: "AS Pikine", short: null, city: "Pikine", stadium: "Stade Alassane Djigo" },
      { name: "ASC HLM", short: "HLM", city: "Dakar", stadium: "Stade municipal des HLM" },
      { name: "Stade de Mbour", short: null, city: "Mbour", stadium: "Stade Caroline Faye" },
      { name: "AS Dakar Sacré-Cœur", short: "DSC", city: "Dakar", stadium: "Stade municipal de Yoff" },
      { name: "Guédiawaye FC", short: "GFC", city: "Guédiawaye", stadium: "Stade Amadou Barry" },
      { name: "ASC La Linguère", short: null, city: "Saint-Louis", stadium: "Stade Mawade Wade" },
      // promoted from Ligue 2 for 2026/27; Diambars is the CAF Confederation Cup entrant
      { name: "Essamaye FC", short: null, city: "Ziguinchor", stadium: "Stade Aline Sitoé Diatta" },
      // Diambars' academy is in Saly; its home ground is not documented, Mbour's stadium is the nearest league venue
      { name: "Diambars", short: null, city: "Saly", stadium: "Stade Caroline Faye", big: true },
    ],
  },
  cup: { name: "Coupe du Sénégal", shortName: "Coupe du Sénégal" },
  stadiums: [
    { name: "Stade Abdoulaye Wade", city: "Diamniadio", capacity: 50000 },
    { name: "Stade Léopold Sédar Senghor", city: "Dakar", capacity: 40000 },
    { name: "Stade Demba Diop", city: "Dakar", capacity: 15000 },
    { name: "Stade Lat-Dior", city: "Thiès", capacity: 8712 },
    { name: "Stade Aline Sitoé Diatta", city: "Ziguinchor", capacity: 10000 },
    { name: "Stade Ngalandou Diouf", city: "Rufisque", capacity: 7500 },
    { name: "Stade Caroline Faye", city: "Mbour", capacity: 5000 },
    { name: "Stade Amadou Barry", city: "Guédiawaye", capacity: 5000 },
    { name: "Stade Alassane Djigo", city: "Pikine", capacity: 4000 },
    { name: "Stade municipal de Ngor", city: "Dakar", capacity: 3000 },
    { name: "Stade municipal de Yoff", city: "Dakar", capacity: 3000 },
    { name: "Stade municipal des HLM", city: "Dakar", capacity: null },
    { name: "Stade Djibril Diagne", city: "Déni Biram Ndao", capacity: 1000 },
    { name: "Stade Mawade Wade", city: "Saint-Louis", capacity: 1500 },
  ],
  nationalStadium: "Stade Abdoulaye Wade",
  kickoffs: ["16:30", "17:00", "16:15"],
  derbies: [
    ["Teungueth FC", "AJEL de Rufisque"],
    ["ASC Jaraaf", "US Gorée"],
    ["Casa Sports", "Essamaye FC"],
    ["US Ouakam", "US Gorée"],
  ],
  continental: { championsLeague: ["Teungueth FC"], confederationCup: ["Diambars"] },
  officialCities: ["Dakar", "Dakar", "Thiès", "Rufisque", "Saint-Louis", "Ziguinchor", "Kaolack", "Mbour", "Pikine"],
  names: {
    male: ["Mamadou", "Ibrahima", "Cheikh", "Moussa", "Abdoulaye", "Ousmane", "Modou", "Pape", "Saliou", "Babacar", "Alioune", "Lamine", "Serigne", "Assane", "Amadou", "Khadim", "Souleymane", "Matar", "Ndongo", "Aliou"],
    female: ["Aïssatou", "Ndeye", "Mariama", "Awa", "Khady", "Coumba", "Astou", "Bineta", "Seynabou", "Rokhaya", "Dieynaba", "Maimouna"],
    surnames: ["Ndiaye", "Diop", "Fall", "Sarr", "Ba", "Faye", "Gueye", "Mbaye", "Thiam", "Seck", "Cissé", "Diouf", "Niang", "Kane", "Sow", "Ndoye", "Mbengue", "Dieng", "Sène", "Tall", "Badji", "Diatta", "Sagna", "Wade", "Lô", "Ndour", "Kébé", "Gaye"],
  },
};

/* ------------------------------------------------------------------ *
 * Côte d'Ivoire — FIF, league run by the LFP
 * ------------------------------------------------------------------ */

const CIV: CountryFact = {
  code: "CIV",
  iso2: "CI",
  name: "Côte d'Ivoire",
  nameFr: "Côte d'Ivoire",
  nameEs: "Costa de Marfil",
  nameDe: "Elfenbeinküste",
  flag: "🇨🇮",
  zone: "UFOA-B",
  capital: "Yamoussoukro",
  timezone: "Africa/Abidjan",
  currency: "XOF",
  federation: { code: "FIF", name: "Fédération Ivoirienne de Football" },
  refereesCommittee: "Commission des arbitres de la FIF",
  syncSource: "COMET",
  league: {
    // since 2025/26 the LFP plays Ligue 1 at the national and AFCON 2023 stadiums, not at Robert-Champroux or the Parc
    name: "Ligue 1 LONACI",
    shortName: "Ligue 1",
    varEnabled: false,
    clubs: [
      // 2025/26 champions (30th title) — CAF Champions League 2026/27, with FC San-Pédro
      { name: "ASEC Mimosas", short: "ASEC", city: "Abidjan", stadium: "Stade Félix Houphouët-Boigny", big: true },
      { name: "FC San-Pédro", short: null, city: "San-Pédro", stadium: "Stade Laurent Pokou", big: true },
      { name: "AFAD Djékanou", short: "AFAD", city: "Djékanou", stadium: "Stade de la Paix", big: true },
      // Mouna FC (Akoupé), ES Agboville, Zoman FC and Inova SC: grounds not documented — they play at the Abidjan venues
      { name: "Mouna FC", short: null, city: "Akoupé", stadium: "Stade Félix Houphouët-Boigny" },
      { name: "US Tchologo", short: null, city: "Ferkessédougou", stadium: "Stade Amadou Gon Coulibaly" },
      { name: "Stade d'Abidjan", short: null, city: "Abidjan", stadium: "Stade Félix Houphouët-Boigny", big: true },
      { name: "Stella Club d'Adjamé", short: null, city: "Abidjan", stadium: "Stade Félix Houphouët-Boigny" },
      { name: "SOL FC", short: "SOL", city: "Abidjan", stadium: "Stade Alassane Ouattara" },
      { name: "CO Korhogo", short: null, city: "Korhogo", stadium: "Stade Amadou Gon Coulibaly", big: true },
      { name: "Bouaké FC", short: null, city: "Bouaké", stadium: "Stade de la Paix" },
      { name: "Stade d'Olympique de l'Armée", short: "SOA", city: "Yamoussoukro", stadium: "Stade Charles Konan Banny", big: true },
      { name: "Inova Sporting Club Association", short: "ISCA", city: "Abidjan", stadium: "Stade Alassane Ouattara" },
      { name: "ES Agboville", short: null, city: "Agboville", stadium: "Stade Alassane Ouattara" },
      { name: "Zoman FC", short: null, city: "Abidjan", stadium: "Stade Alassane Ouattara" },
      // promoted from Ligue 2 for 2026/27
      { name: "Yamoussoukro FC", short: null, city: "Yamoussoukro", stadium: "Stade Charles Konan Banny" },
      { name: "OFC Adiaké", short: null, city: "Adiaké", stadium: "Stade Félix Houphouët-Boigny" },
    ],
  },
  cup: { name: "Coupe Nationale de Côte d'Ivoire", shortName: "Coupe Nationale" },
  stadiums: [
    { name: "Stade Alassane Ouattara", city: "Abidjan", capacity: 60012 },
    { name: "Stade Félix Houphouët-Boigny", city: "Abidjan", capacity: 33000 },
    { name: "Stade de la Paix", city: "Bouaké", capacity: 40000 },
    { name: "Stade Charles Konan Banny", city: "Yamoussoukro", capacity: 20000 },
    { name: "Stade Laurent Pokou", city: "San-Pédro", capacity: 20000 },
    { name: "Stade Amadou Gon Coulibaly", city: "Korhogo", capacity: 20000 },
    { name: "Stade Robert-Champroux", city: "Abidjan", capacity: 10000 },
  ],
  nationalStadium: "Stade Alassane Ouattara",
  kickoffs: ["15:30", "18:00"],
  derbies: [
    ["ASEC Mimosas", "Stade d'Abidjan"],
    ["CO Korhogo", "US Tchologo"],
    ["Stade d'Olympique de l'Armée", "Yamoussoukro FC"],
  ],
  continental: { championsLeague: ["ASEC Mimosas", "FC San-Pédro"], confederationCup: ["AFAD Djékanou", "CO Korhogo"] },
  officialCities: ["Abidjan", "Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Korhogo", "Daloa", "Man", "Gagnoa"],
  names: {
    male: ["Koffi", "Yao", "Konan", "Kouassi", "Kouamé", "N'Guessan", "Ibrahim", "Seydou", "Lassina", "Bakary", "Didier", "Hervé", "Arsène", "Franck", "Ghislain", "Sylvain", "Moïse", "Abou", "Siaka", "Roland"],
    female: ["Aya", "Affoué", "Adjoua", "Akissi", "Amenan", "Mariam", "Fatim", "Nadège", "Christelle", "Estelle", "Ange", "Salimata"],
    surnames: ["Koné", "Ouattara", "Traoré", "Coulibaly", "Bamba", "Touré", "Yao", "Konan", "N'Guessan", "Kouamé", "Kouadio", "Gnagbo", "Zadi", "Yapi", "Aka", "Brou", "Tanoh", "Djédjé", "Gbané", "Diabaté", "Soro", "Silué", "Doumbia", "Fofana", "Kra", "Assi", "Ehui", "Dago"],
  },
};

/* ------------------------------------------------------------------ *
 * Republic of the Congo — FECOFOOT, league run by LINAFOOT
 *
 * The last completed Ligue 1 is 2023/24 (champions AC Léopards de Dolisie). FIFA suspended FECOFOOT from
 * February to May 2025 and the stadiums were closed from October 2025, so the 16-club 2025/26 season was never
 * completed; these are the 16 clubs confirmed for it. CAF accepted no Congolese club for 2026/27.
 * ------------------------------------------------------------------ */

const COG: CountryFact = {
  code: "COG",
  iso2: "CG",
  name: "Congo",
  nameFr: "Congo",
  nameEs: "República del Congo",
  nameDe: "Republik Kongo",
  flag: "🇨🇬",
  zone: "UNIFFAC",
  capital: "Brazzaville",
  timezone: "Africa/Brazzaville",
  currency: "XAF",
  federation: { code: "FECOFOOT", name: "Fédération Congolaise de Football" },
  refereesCommittee: "Commission centrale des arbitres de la FECOFOOT",
  syncSource: "Manual entry",
  league: {
    name: "Championnat National Direct Ligue 1",
    shortName: "Ligue 1",
    varEnabled: false,
    clubs: [
      { name: "AC Léopards de Dolisie", short: null, city: "Dolisie", stadium: "Stade Denis Sassou Nguesso", big: true },
      // Oyo's ground is the Complexe omnisports d'Oyo; its capacity is not reliably documented
      { name: "AS Otohô", short: null, city: "Oyo", stadium: "Complexe omnisports d'Oyo", big: true },
      { name: "Étoile du Congo", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat", big: true },
      { name: "CSM Diables Noirs", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat", big: true },
      { name: "CARA Brazzaville", short: "CARA", city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat", big: true },
      { name: "Interclub", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "JS Talangaï", short: "JST", city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "AS Vegas", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "Bana Nouvelle Génération", short: "BNG", city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "FC Kondzo", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "AS Jeunesse Unie de Kintélé", short: "JUK", city: "Kintélé", stadium: "Stade Municipal de Kintélé" },
      { name: "Racing Club de Brazzaville", short: "RCB", city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "Red Star", short: null, city: "Brazzaville", stadium: "Stade Alphonse-Massamba-Débat" },
      { name: "AS Cheminots", short: null, city: "Pointe-Noire", stadium: "Stade Municipal de Pointe-Noire" },
      { name: "V.Club Mokanda", short: null, city: "Pointe-Noire", stadium: "Stade Municipal de Pointe-Noire" },
      { name: "Kouilou Football Académie", short: "KFA", city: "Pointe-Noire", stadium: "Stade Municipal de Pointe-Noire" },
    ],
  },
  cup: { name: "Coupe du Congo", shortName: "Coupe du Congo" },
  stadiums: [
    { name: "Stade Municipal de Kintélé", city: "Kintélé", capacity: 60055 },
    { name: "Stade Alphonse-Massamba-Débat", city: "Brazzaville", capacity: 33037 },
    { name: "Stade Municipal de Pointe-Noire", city: "Pointe-Noire", capacity: 13000 },
    { name: "Stade Omnisport Marien Ngouabi", city: "Owando", capacity: 13037 },
    { name: "Stade Denis Sassou Nguesso", city: "Dolisie", capacity: 5000 },
    { name: "Complexe omnisports d'Oyo", city: "Oyo", capacity: null },
  ],
  nationalStadium: "Stade Municipal de Kintélé",
  // the regulations leave kick-off times to the published calendar; these are the usual afternoon slots
  kickoffs: ["15:30", "16:00"],
  derbies: [
    ["CARA Brazzaville", "CSM Diables Noirs"],
    ["Étoile du Congo", "CARA Brazzaville"],
    ["AS Cheminots", "V.Club Mokanda"],
  ],
  continental: { championsLeague: [], confederationCup: [] },
  officialCities: ["Brazzaville", "Brazzaville", "Pointe-Noire", "Dolisie", "Owando", "Nkayi", "Oyo"],
  names: {
    male: ["Prince", "Durel", "Hardy", "Rodrigue", "Brel", "Exaucé", "Gloire", "Christ", "Fiacre", "Aristide", "Destin", "Bienvenu", "Chancel", "Ulrich", "Arnaud", "Wilfrid", "Juvrel", "Thierry", "Armel", "Brice"],
    female: ["Grâce", "Merveille", "Bénie", "Divine", "Flore", "Prisca", "Orphée", "Josiane", "Ornella", "Gladys", "Chancelle", "Dorcas"],
    surnames: ["Mabiala", "Moukoko", "Ngoma", "Mavoungou", "Bouanga", "Okemba", "Itoua", "Obami", "Massamba", "Nkounkou", "Loubaki", "Mampouya", "Bakala", "Kimbembe", "Malonga", "Mbemba", "Ngakosso", "Ondongo", "Ibara", "Elenga", "Ngouala", "Mouanda", "Bitsindou", "Nzaou", "Boukaka", "Makosso", "Tchicaya", "Loemba"],
  },
};

export const COUNTRY_FACTS: CountryFact[] = [SEN, CIV, COG];

/**
 * Referees and assistants from these federations known from CAF/FIFA appointments. The generator refuses any
 * generated name on this list, so a fictional official can never be mistaken for a real one.
 */
export const REAL_OFFICIALS = [
  // Senegal
  "Maguette Ndiaye", "Issa Sy", "Malang Diedhiou", "Djibril Camara", "El Hadji Malick Samba", "Ndiaga Samba", "Fatou Thioune", "Daouda Gueye", "Mamadou Ngom", "Babacar Sarr", "Adama Diallo", "Mame Coumba Faye", "Nogaye Ndiaye",
  // Côte d'Ivoire
  "Denis Dembélé", "Clément Kpan", "Marius Tan", "Laurent Kanoh", "Kouassi Frédéric", "Kouamé Kouassi", "Bamba Mamadou",
  // Congo
  "Messie Nkoua", "Prince Mavoungou", "Jean-Jacques Ndala",
];
