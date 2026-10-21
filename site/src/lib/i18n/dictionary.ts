// Backward-compatible re-export. The copy now lives in `src/locales/<locale>/<namespace>.json`
// and is assembled by `@/locales`; import from there in new code.

export {
  defaultLocale,
  dictionaries,
  localeCodes,
  localeLabels,
  localeTags,
  locales,
  type Dict,
  type Locale,
} from "@/locales";
