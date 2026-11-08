import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    fr: { translation: {} }, // Phase 3: Übersetzungen
    it: { translation: {} },
  },
  lng: "de",
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
