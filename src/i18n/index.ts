import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./locales/es.json";
import en from "./locales/en.json";

const saved = localStorage.getItem("lang");
const browser = navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
const lng = saved ?? browser;

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
