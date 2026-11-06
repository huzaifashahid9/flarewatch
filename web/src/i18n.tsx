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
  "Expert view": "تفصیلی منظر",
  "Simple view": "آسان منظر",
  "Every year, Pakistan burns away gas worth": "ہر سال پاکستان اتنی قیمت کی گیس جلا کر ضائع کر دیتا ہے",
  "Rs {n} crore": "{n} کروڑ روپے",
  "That gas could give electricity to {h} homes.": "اس گیس سے {h} گھروں کو بجلی مل سکتی ہے۔",
  "gas flares we can see": "گیس فلیئرز جو ہمیں نظر آ رہے ہیں",
  "new flares in the last 2 weeks": "پچھلے 2 ہفتوں میں نئے فلیئرز",
  "How it works": "یہ کیسے کام کرتا ہے",
  "Satellites fly over Pakistan every night.": "سیٹلائٹ ہر رات پاکستان کے اوپر سے گزرتے ہیں۔",
  "They spot the heat of gas being burned at oil and gas fields.": "وہ تیل اور گیس کے میدانوں میں جلتی گیس کی گرمی پکڑ لیتے ہیں۔",
  "We work out how much money and electricity is lost.": "ہم حساب لگاتے ہیں کہ کتنا پیسہ اور بجلی ضائع ہو رہی ہے۔",
  "Reading the map": "نقشہ کیسے پڑھیں",
  "Bright dot: a gas flare": "روشن نقطہ: گیس فلیئر",
  "Blue dot: a new flare": "نیلا نقطہ: نیا فلیئر",
  "Faint dot: maybe a factory, not confirmed": "ہلکا نقطہ: شاید کوئی کارخانہ، تصدیق نہیں ہوئی",
  "Tap any dot to see what it costs.": "کسی بھی نقطے کو دبائیں اور دیکھیں اس کا کتنا نقصان ہے۔",
  "▶ Watch a whole year in one minute": "▶ پورا سال ایک منٹ میں دیکھیں",
  "💬 Ask a question in plain words": "💬 آسان الفاظ میں سوال پوچھیں",
  "Show all the numbers (expert view)": "تمام اعداد و شمار دکھائیں (تفصیلی منظر)",
  "🆕 New gas flare": "🆕 نیا گیس فلیئر",
  "🔥 Gas flare": "🔥 گیس فلیئر",
  "❓ Hot spot, not confirmed": "❓ گرم مقام، تصدیق نہیں ہوئی",
  "Near {f}": "{f} کے قریب",
  "Seen burning on {n} nights this year.": "اس سال {n} راتوں کو جلتا دیکھا گیا۔",
  "Rs {n} crore a year": "سالانہ {n} کروڑ روپے",
  "of gas burned here, enough for {h} homes.": "کی گیس یہاں جلتی ہے، جو {h} گھروں کے لیے کافی ہے۔",
  "We don't have an amount for this flare yet.": "اس فلیئر کی مقدار ابھی ہمارے پاس نہیں ہے۔",
  "This may be a factory such as a brick kiln, so we don't count it.": "یہ اینٹوں کا بھٹہ یا کوئی کارخانہ ہو سکتا ہے، اس لیے ہم اسے شمار نہیں کرتے۔",
  "See full details": "مکمل تفصیل دیکھیں",
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
