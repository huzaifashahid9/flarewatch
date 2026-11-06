"use client";

import { createContext, useContext } from "react";

export type Lang = "en" | "ur";

const UR: Record<string, string> = {
  "Gas flares across Pakistan, seen from space every night.": "پاکستان بھر میں جلتی گیس، ہر رات خلا سے دیکھی گئی۔",
  "Burned every year at {n} known flares": "{n} معلوم فلیئرز پر ہر سال جلنے والی گیس",
  "of gas ({range}) at ${price}/MMBtu imported LNG": "کی گیس ({range})، درآمدی ایل این جی ${price}/MMBtu کے حساب سے",
  "MMSCFD gas": "MMSCFD گیس",
  "t CO₂e / yr": "ٹن CO₂e سالانہ",
  "MW of power": "میگاواٹ بجلی",
  "About {c} LNG cargoes a year, or power for {h} homes": "تقریباً {c} ایل این جی جہاز سالانہ، یا {h} گھروں کی بجلی",
  "Flares burn": "فلیئر جلنے کی شرح",
  "official": "سرکاری",
  "measured": "ناپی گئی",
  "Since you opened this page, Pakistan has burned": "جب سے آپ نے یہ صفحہ کھولا، پاکستان جلا چکا ہے",
  "of gas, at the known flares (Rs {r}/$ assumed)": "کی گیس، معلوم فلیئرز پر (فرض کردہ ریٹ {r} روپے فی ڈالر)",
  "Persistent": "مستقل",
  "Intermittent": "وقفے وقفے سے",
  "Monitoring": "زیرِ نگرانی",
  "Known flares": "معلوم فلیئرز",
  "New": "نئے",
  "{k} of {n} sites match known flares in the World Bank catalogue (solid dots). Faint dots are unconfirmed heat sources, which may be cement, steel or brick plants.":
    "{n} میں سے {k} مقامات ورلڈ بینک کی فہرست کے معلوم فلیئرز ہیں (ٹھوس نقطے)۔ ہلکے نقطے غیر تصدیق شدہ گرم مقامات ہیں، جو سیمنٹ، اسٹیل یا اینٹوں کے بھٹے ہو سکتے ہیں۔",
  "New flares in the last two weeks": "پچھلے دو ہفتوں میں نئے فلیئرز",
  "▶ Play a year of flares in 60 seconds": "▶ ایک سال کے فلیئرز 60 سیکنڈ میں دیکھیں",
  "Stop the time-lapse": "ٹائم لیپس روکیں",
  "Ask the AI analyst": "اے آئی تجزیہ کار سے پوچھیں",
  "Check a flare report against satellites": "کمپنی کی فلیئر رپورٹ کا سیٹلائٹ سے موازنہ کریں",
  "Last updated": "آخری اپڈیٹ",
  "site": "مقام",
  "Known flare (World Bank {y})": "معلوم فلیئر (ورلڈ بینک {y})",
  "Unconfirmed: not a known flare. Could be a cement, steel or brick plant.": "غیر تصدیق شدہ: معلوم فلیئر نہیں۔ سیمنٹ، اسٹیل یا اینٹوں کا کارخانہ ہو سکتا ہے۔",
  "Seen on {n} nights, last {d}": "{n} راتوں میں دیکھا گیا، آخری بار {d}",
  "Nearest named field: {f} ({km} km, OpenStreetMap)": "قریب ترین معلوم فیلڈ: {f} ({km} کلومیٹر، اوپن اسٹریٹ میپ)",
  "gas value / yr": "گیس کی قیمت سالانہ",
  "CO₂e / yr": "CO₂e سالانہ",
  "power": "بجلی",
  "homes": "گھر",
  "Road to zero routine flaring, 2030": "2030 تک معمول کی فلیئرنگ صفر کرنے کا راستہ",
};

export const LangContext = createContext<Lang>("en");

export function useT() {
  const lang = useContext(LangContext);
  return (key: string, vars: Record<string, string | number> = {}) => {
    let s = lang === "ur" ? UR[key] ?? key : key;
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
