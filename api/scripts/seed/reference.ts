// Reference facts about the supported countries that the demo dataset does not carry:
// ISO alpha-2, Spanish and German names, time zone, currency and the federation's full name.

export interface CountryReference {
  iso2: string;
  nameEs: string;
  nameDe: string;
  timezone: string;
  currency: string;
  federationName: string;
}

export const COUNTRY_REFERENCE: Record<string, CountryReference> = {
  EGY: { iso2: "EG", nameEs: "Egipto", nameDe: "Ägypten", timezone: "Africa/Cairo", currency: "EGP", federationName: "Egyptian Football Association" },
  MAR: { iso2: "MA", nameEs: "Marruecos", nameDe: "Marokko", timezone: "Africa/Casablanca", currency: "MAD", federationName: "Fédération Royale Marocaine de Football" },
  TUN: { iso2: "TN", nameEs: "Túnez", nameDe: "Tunesien", timezone: "Africa/Tunis", currency: "TND", federationName: "Fédération Tunisienne de Football" },
  DZA: { iso2: "DZ", nameEs: "Argelia", nameDe: "Algerien", timezone: "Africa/Algiers", currency: "DZD", federationName: "Fédération Algérienne de Football" },
  SEN: { iso2: "SN", nameEs: "Senegal", nameDe: "Senegal", timezone: "Africa/Dakar", currency: "XOF", federationName: "Fédération Sénégalaise de Football" },
  MLI: { iso2: "ML", nameEs: "Malí", nameDe: "Mali", timezone: "Africa/Bamako", currency: "XOF", federationName: "Fédération Malienne de Football" },
  CIV: { iso2: "CI", nameEs: "Costa de Marfil", nameDe: "Elfenbeinküste", timezone: "Africa/Abidjan", currency: "XOF", federationName: "Fédération Ivoirienne de Football" },
  GHA: { iso2: "GH", nameEs: "Ghana", nameDe: "Ghana", timezone: "Africa/Accra", currency: "GHS", federationName: "Ghana Football Association" },
  NGA: { iso2: "NG", nameEs: "Nigeria", nameDe: "Nigeria", timezone: "Africa/Lagos", currency: "NGN", federationName: "Nigeria Football Federation" },
  CMR: { iso2: "CM", nameEs: "Camerún", nameDe: "Kamerun", timezone: "Africa/Douala", currency: "XAF", federationName: "Fédération Camerounaise de Football" },
  COD: { iso2: "CD", nameEs: "República Democrática del Congo", nameDe: "DR Kongo", timezone: "Africa/Kinshasa", currency: "CDF", federationName: "Fédération Congolaise de Football-Association" },
  KEN: { iso2: "KE", nameEs: "Kenia", nameDe: "Kenia", timezone: "Africa/Nairobi", currency: "KES", federationName: "Football Kenya Federation" },
  TZA: { iso2: "TZ", nameEs: "Tanzania", nameDe: "Tansania", timezone: "Africa/Dar_es_Salaam", currency: "TZS", federationName: "Tanzania Football Federation" },
  UGA: { iso2: "UG", nameEs: "Uganda", nameDe: "Uganda", timezone: "Africa/Kampala", currency: "UGX", federationName: "Federation of Uganda Football Associations" },
  BDI: { iso2: "BI", nameEs: "Burundi", nameDe: "Burundi", timezone: "Africa/Bujumbura", currency: "BIF", federationName: "Fédération de Football du Burundi" },
  ZAF: { iso2: "ZA", nameEs: "Sudáfrica", nameDe: "Südafrika", timezone: "Africa/Johannesburg", currency: "ZAR", federationName: "South African Football Association" },
  ZMB: { iso2: "ZM", nameEs: "Zambia", nameDe: "Sambia", timezone: "Africa/Lusaka", currency: "ZMW", federationName: "Football Association of Zambia" },
  ZWE: { iso2: "ZW", nameEs: "Zimbabue", nameDe: "Simbabwe", timezone: "Africa/Harare", currency: "ZWG", federationName: "Zimbabwe Football Association" },
  BWA: { iso2: "BW", nameEs: "Botsuana", nameDe: "Botswana", timezone: "Africa/Gaborone", currency: "BWP", federationName: "Botswana Football Association" },
  AGO: { iso2: "AO", nameEs: "Angola", nameDe: "Angola", timezone: "Africa/Luanda", currency: "AOA", federationName: "Federação Angolana de Futebol" },
};
