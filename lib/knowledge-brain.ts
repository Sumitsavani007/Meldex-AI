/**
 * lib/knowledge-brain.ts
 *
 * Static verified local knowledge base.
 * Answers common geography, history, and general India/Gujarat questions
 * without LLM calls — fast, accurate, always consistent.
 *
 * Routing: checked BEFORE the chat LLM brain, AFTER live search.
 * Live search still handles: "current CM", "latest news", "election results" etc.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeFact {
  /** Regex patterns to match a user query (case-insensitive) */
  patterns: RegExp[];
  /** English answer */
  answer: string;
  /** Gujarati answer (romanized) */
  answerGu?: string;
  /** Hindi answer (romanized) */
  answerHi?: string;
  /** Category for potential UI display */
  category: "geography" | "history" | "general" | "india" | "music" | "politics" | "sports";
  /** Known keywords that appear in the question (used by isKnowledgeQuery) */
  keywords: string[];
}

export interface KnowledgeResult {
  found: true;
  answer: string;
  answerGu?: string;
  fact: KnowledgeFact;
}

export interface KnowledgeMiss {
  found: false;
}

export type KnowledgeLookup = KnowledgeResult | KnowledgeMiss;

// ── Knowledge Base ────────────────────────────────────────────────────────────

export const KNOWLEDGE_BASE: KnowledgeFact[] = [
  // ── Gujarat politics ──────────────────────────────────────────────────────
  {
    patterns: [
      /harsh\s*sangh(a)?vi\b.*\b(kon|who|shu|post|rajkaran|politics|minister|deputy|home|portfolio)\b/i,
      /\b(kon|who|shu|post|rajkaran|politics|minister|deputy|home|portfolio)\b.*harsh\s*sangh(a)?vi\b/i,
      /હર્ષ\s*સંઘવી.*(કોણ|પોસ્ટ|રાજકારણ|મંત્રી|ગૃહ|નાયબ)/i,
    ],
    answer: "**Harsh Sanghavi** is a BJP politician from Gujarat and the **Deputy Chief Minister of Gujarat**. He represents the Majura Assembly constituency and holds important portfolios including **Home**.",
    answerGu: "**હર્ષ સંઘવી** ગુજરાતના BJP નેતા છે અને હાલમાં **ગુજરાતના નાયબ મુખ્યમંત્રી** છે. તેઓ Majura વિધાનસભા બેઠકનું પ્રતિનિધિત્વ કરે છે અને **Home/Gruh વિભાગ** સહિત મહત્વનાં portfolios સંભાળે છે.",
    answerHi: "**Harsh Sanghavi** Gujarat ke BJP neta aur **Deputy Chief Minister of Gujarat** hain. Woh Majura Assembly constituency se MLA hain aur **Home** jaise important portfolios sambhalte hain.",
    category: "politics",
    keywords: ["harsh sanghvi", "harsh sanghavi", "હર્ષ", "સંઘવી", "sanghvi", "sanghavi"],
  },

  {
    patterns: [
      /govind(bhai)?\s*dholaki?ya\b.*\b(kon|who|shu|rajkaran|politics|mp|rajya\s*sabha|diamond|srk|business)\b/i,
      /\b(kon|who|shu|rajkaran|politics|mp|rajya\s*sabha|diamond|srk|business)\b.*govind(bhai)?\s*dholaki?ya\b/i,
      /ગોવિંદ(ભાઈ)?\s*ધોળા?કિયા.*(કોણ|રાજકારણ|સાંસદ|રાજ્યસભા|હીરા|વ્યવસાય)/i,
    ],
    answer: "**Govindbhai Laljibhai Dholakia** is a Gujarat-based diamond businessman, philanthropist, and **BJP Rajya Sabha MP from Gujarat**. He is the founder-chairman emeritus of **Shree Ramkrishna Exports (SRK)**, a major Surat-based diamond company.",
    answerGu: "**ગોવિંદભાઈ લાલજીભાઈ ધોળકિયા** ગુજરાતના diamond businessman, philanthropist અને **BJPના Gujaratથી Rajya Sabha MP** છે. તેઓ Surat-based **Shree Ramkrishna Exports (SRK)** ના founder-chairman emeritus તરીકે જાણીતા છે.",
    answerHi: "**Govindbhai Laljibhai Dholakia** Gujarat ke diamond businessman, philanthropist aur **BJP Rajya Sabha MP from Gujarat** hain. Woh Surat-based **Shree Ramkrishna Exports (SRK)** ke founder-chairman emeritus hain.",
    category: "politics",
    keywords: ["govind dholakia", "govind dholakiya", "govindbhai dholakia", "govindbhai dholakiya", "govindbhai laljibhai dholakia", "ગોવિંદ", "ધોળકિયા", "ધોળાકિયા", "dholakia", "dholakiya", "srk"],
  },

  // ── Cricket ───────────────────────────────────────────────────────────────
  {
    patterns: [
      /virat\s*kohli\b.*\b(kon|who|shu|cricketer|captain|batsman)\b/i,
      /\b(kon|who|shu|cricketer|captain|batsman)\b.*virat\s*kohli\b/i,
      /વિરાટ\s*કોહલી.*(કોણ|ક્રિકેટ|ખેલાડી|કેપ્ટન)/i,
    ],
    answer: "**Virat Kohli** is an Indian cricketer and one of the greatest modern batters. He is a former captain of the Indian national team and plays for Royal Challengers Bengaluru in the IPL.",
    answerGu: "**વિરાટ કોહલી** ભારતના પ્રસિદ્ધ ક્રિકેટર અને આધુનિક યુગના શ્રેષ્ઠ batsmen પૈકી એક છે. તેઓ ભારતીય ટીમના ભૂતપૂર્વ captain છે અને IPLમાં Royal Challengers Bengaluru માટે રમે છે.",
    answerHi: "**Virat Kohli** Bharat ke prasiddh cricketer aur modern era ke greatest batters mein se ek hain. Woh Indian team ke former captain hain aur IPL mein Royal Challengers Bengaluru ke liye khelte hain.",
    category: "sports",
    keywords: ["virat kohli", "વિરાટ", "કોહલી", "kohli"],
  },

  {
    patterns: [
      /virat\s*kohli\b.*\b(ipl|runs?|run|total|ketla|ketlaa|ketli|marya|scored)\b/i,
      /\b(ipl|runs?|run|total|ketla|ketlaa|ketli|marya|scored)\b.*virat\s*kohli\b/i,
      /\b(ene|ena|teni|tena|e)\b.*\b(ipl|runs?|run|total|ketla|ketlaa|marya)\b/i,
      /વિરાટ\s*કોહલી.*(આઈપીએલ|IPL|રન|કુલ)/i,
    ],
    answer: "Virat Kohli has scored about **9,300+ runs in the IPL** after the 2026 season. His total is commonly listed around **9,336 IPL runs**, depending on the stats source/update timing.",
    answerGu: "વિરાટ કોહલીએ 2026 season પછી IPLમાં આશરે **9,300+ runs** બનાવ્યા છે. સામાન્ય રીતે તેમનો કુલ આંકડો લગભગ **9,336 IPL runs** તરીકે દર્શાય છે, source/update પ્રમાણે થોડો ફેર પડી શકે.",
    answerHi: "Virat Kohli ne 2026 season ke baad IPL mein lagbhag **9,300+ runs** banaye hain. Commonly total around **9,336 IPL runs** list hota hai, source/update ke hisaab se thoda fark ho sakta hai.",
    category: "sports",
    keywords: ["virat kohli", "kohli", "ipl", "runs", "run", "વિરાટ", "કોહલી"],
  },

  // ── Botad ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      /botad\s*(taluko|taluka|che k|jillo|jilla|district|zip|city)/i,
      /botad\s*(shu|kya|what)\s*(che|hai|is)/i,
      /\bbotad\b.*\b(taluko|jillo|district)\b/i,
      /\b(taluko|jillo|district)\b.*\bbotad\b/i,
    ],
    answer: "Botad is a **district** in Gujarat, India. It was carved out of Bhavnagar district and officially formed on 15 August 2013.",
    answerGu: "Botad ek **jillo** che Gujarat ma. Teni sthapna 15 August 2013 na roj Bhavnagar jilla manthii alag karine thayi hati.",
    answerHi: "Botad, Gujarat ka ek **jila** hai. Iska gathan 15 August 2013 ko Bhavnagar jile se alag karke hua tha.",
    category: "geography",
    keywords: ["botad"],
  },

  // ── Vallabhipur / Vallabhpur ────────────────────────────────────────────────
  {
    patterns: [
      /vallabh(i)?pur\s*(taluko|taluka|che|jillo|in|kya|shu|which|where|kyaa)/i,
      /vallabh(i)?pur\s*(kya|which)\s*(district|jilla|jillo)/i,
      /\bvallabh(i)?pur\b.*\?/i,
    ],
    answer: "Vallabhipur (also spelled Vallabhpur) is a **taluka** in Bhavnagar district, Gujarat.",
    answerGu: "Vallabhipur (Vallabhpur) **Bhavnagar jilla** ni ek taluka che, Gujarat ma.",
    answerHi: "Vallabhipur (Vallabhpur), Gujarat mein **Bhavnagar jile** ki ek taluka hai.",
    category: "geography",
    keywords: ["vallabhipur", "vallabhpur"],
  },

  // ── Bhavnagar ──────────────────────────────────────────────────────────────
  {
    patterns: [
      /bhavnagar\s*(district|jillo|jilla|city|shu|kya|che|hai|which|where)/i,
      /\bbhavnagar\b.*\b(district|jillo)\b/i,
    ],
    answer: "Bhavnagar is both a **city and a district** in the Saurashtra region of Gujarat, India. It is known for ship-breaking at Alang and the Velavadar National Park.",
    answerGu: "Bhavnagar Gujarat na Saurashtra vistaar ma **shahar ane jillo** banne che. Alang ship-breaking yard ane Velavadar National Park mate jaanu che.",
    category: "geography",
    keywords: ["bhavnagar"],
  },

  // ── Saurashtra ─────────────────────────────────────────────────────────────
  {
    patterns: [
      /saurashtra\s*(kya|shu|che|which|where|region|vistaar)/i,
      /which\s*(region|part)\s*(is|are)\s*saurashtra/i,
    ],
    answer: "Saurashtra is a **peninsular region** in western Gujarat, India. It includes districts like Rajkot, Jamnagar, Bhavnagar, Junagadh, Amreli, Porbandar, Morbi, Surendranagar, Botad, and Gir Somnath.",
    answerGu: "Saurashtra Gujarat na pashchim bhag ma ek **dweepakalpiya pradesh** che. Rajkot, Jamnagar, Bhavnagar, Junagadh, Amreli, Porbandar, Morbi, Surendranagar, Botad ane Gir Somnath no samamavesh thay che.",
    category: "geography",
    keywords: ["saurashtra"],
  },

  // ── Gujarat districts count ─────────────────────────────────────────────────
  {
    patterns: [
      /gujarat\s*(ma|maa|mein|me|has|have)?\s*(keti|ketla|how many|kitne)\s*(district|jilla|jillo)/i,
      /how many districts.*gujarat/i,
    ],
    answer: "Gujarat currently has **33 districts**. The most recently formed district is Botad (2013).",
    answerGu: "Gujarat ma haal **33 jilla** che. Sauthi naavo jillo Botad che (2013).",
    category: "geography",
    keywords: ["gujarat", "district", "jillo", "jilla"],
  },

  // ── Gujarat capital ─────────────────────────────────────────────────────────
  {
    patterns: [
      /gujarat\s*(ni|no|ki|ka)\s*(rajdhani|capital)/i,
      /capital\s*(of|city)\s*gujarat/i,
      /gujarat\s*capital/i,
    ],
    answer: "The **capital of Gujarat** is **Gandhinagar**. It is also the seat of the Gujarat High Court. Ahmedabad is the largest city.",
    answerGu: "Gujarat ni **rajdhani Gandhinagar** che. Ahmedabad Gujarat nu sauthi motu shahar che.",
    answerHi: "Gujarat ki **rajdhani Gandhinagar** hai. Ahmedabad Gujarat ka sabase bada shahar hai.",
    category: "geography",
    keywords: ["gujarat", "rajdhani", "capital", "gandhinagar"],
  },

  // ── Ahmedabad ──────────────────────────────────────────────────────────────
  {
    patterns: [
      /ahmedabad\s*(shu|kya|che|hai|city|district)/i,
      /ahmedabad\s*(which|where)/i,
    ],
    answer: "Ahmedabad (also Amdavad) is the **largest city in Gujarat** and the seventh-largest city in India. It is a major commercial and industrial hub.",
    answerGu: "Ahmedabad (Amdavad) Gujarat nu **sauthi motu shahar** che ane Bharat nu saatwu motu shahar che.",
    category: "geography",
    keywords: ["ahmedabad", "amdavad"],
  },

  // ── Gujarat formation ──────────────────────────────────────────────────────
  {
    patterns: [
      /gujarat\s*(kya|kyare|when|sthapna|formed|established|founded|created)/i,
      /gujarat\s*(state|rajya)\s*(kya|when|kyare)/i,
      /gujarat\s*(formation|day|divas)/i,
    ],
    answer: "Gujarat was established as a separate state on **1 May 1960**, when it was carved out of the former Bombay State. May 1 is celebrated as **Gujarat Day** (Gujarat Sthapana Divas).",
    answerGu: "Gujarat nu **sthapna 1 May 1960 na roj** thayelu che, jyare Bombay Rajya ma thii alag karvaama aavyu hatu. 1 May ne **Gujarat Sthapana Divas** tareke ujavay che.",
    category: "history",
    keywords: ["gujarat", "sthapna", "sthapana", "formed", "established", "1960"],
  },

  // ── Junagadh ──────────────────────────────────────────────────────────────
  {
    patterns: [
      /junagadh\s*(district|jillo|shu|kya|che|city|taluka)/i,
    ],
    answer: "Junagadh is a **city and district** in the Saurashtra region of Gujarat. It is famous for Girnar mountain, Uparkot Fort, and being near Gir National Park (home of Asiatic lions).",
    answerGu: "Junagadh Gujarat na Saurashtra vistaar ma ek **shahar ane jillo** che. Girnar parvat, Uparkot Fort ane Gir National Park (esiaayi sinh) mate jaanu che.",
    category: "geography",
    keywords: ["junagadh"],
  },

  // ── Gir / Asiatic lions ────────────────────────────────────────────────────
  {
    patterns: [
      /gir\s*(forest|national park|sanctuary|lion|sinh)/i,
      /asiatic\s*lion/i,
      /\bsinhh?\b.*(kyaa?|where|kya)/i,
    ],
    answer: "The **Gir National Park and Wildlife Sanctuary** in Gujarat is the **only wild habitat of the Asiatic lion** in the world. It is located in Junagadh and Gir Somnath districts.",
    answerGu: "**Gir National Park** Gujarat ma Junagadh ane Gir Somnath jilla ma aavelu che. Aa duniya ma **esiaayi sinhh nu ekmatra jangali nivaas** che.",
    category: "geography",
    keywords: ["gir", "lion", "sinh", "national park"],
  },

  // ── Somnath ────────────────────────────────────────────────────────────────
  {
    patterns: [
      /somnath\s*(temple|mandir|shu|kya|che|where|kyaa)/i,
      /somnath\s*(district|jillo)/i,
    ],
    answer: "**Somnath** is one of the twelve Jyotirlinga shrines of Lord Shiva and is located in the Gir Somnath district of Gujarat. It is one of the most sacred temples in Hinduism.",
    answerGu: "**Somnath** Bhagvan Shiv na baaro Jyotirling paiki ek che ane Gujarat na Gir Somnath jilla ma aavelu che.",
    category: "geography",
    keywords: ["somnath"],
  },

  // ── Rann of Kutch ──────────────────────────────────────────────────────────
  {
    patterns: [
      /\bdope\s*shope\b.*\b(song|g[aã]n[ao]?|gana|singer|artist|gayu|gayo|kone|kon|who)\b/i,
      /\b(song|g[aã]n[ao]?|gana|singer|artist|gayu|gayo|kone|kon|who)\b.*\bdope\s*shope\b/i,
      /દોપે\s*શોપે.*(ગાયું|ગાયુ|કોણ|સિંગર|ગાયક)/i,
    ],
    answer: `"Dope Shope" is by **Yo Yo Honey Singh and Deep Money**. It is from the album **International Villager**.`,
    answerGu: `"Dope Shope" ગીત **Yo Yo Honey Singh અને Deep Money** એ ગાયું છે. આ ગીત **International Villager** albumનું છે.`,
    answerHi: `"Dope Shope" gaana **Yo Yo Honey Singh aur Deep Money** ne gaya hai. Yeh **International Villager** album ka gaana hai.`,
    category: "music",
    keywords: ["dope shope", "dope", "shope", "honey singh", "deep money", "દોપે", "શોપે"],
  },

  {
    patterns: [
      /rann\s*(of)?\s*kutch/i,
      /kutch\s*(shu|kya|rann|salt)/i,
      /white\s*desert.*gujarat/i,
    ],
    answer: "The **Rann of Kutch** is a seasonal salt marsh in the Kutch district of Gujarat. It is one of the largest salt deserts in the world and famous for the **Rann Utsav** festival.",
    answerGu: "**Rann of Kutch** Gujarat na Kutch jilla ma ek seasonal namak ni bhumi che. Aa duniya ma sauthi mota namak na rann paiki ek che ane **Rann Utsav** mate jaanu che.",
    category: "geography",
    keywords: ["rann", "kutch", "white desert"],
  },
];

// ── Lookup function ────────────────────────────────────────────────────────────

function detectLanguage(text: string): "gu" | "hi" | "en" {
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(che|chu|chhu|chhe|mane|tamne|shu|su|kya\s*che|kon\s*che|kone|ene|ena|em|nai|nathi|atyar|atyare|ketla|ketli|marya|gayo|gayu|run|rajkaran|jillo|taluko|vistaar|rajdhani|shahar)\b/i.test(text)) return "gu";
  if (/\b(kya|kaun|hai|hain|mein|ka|ki|ke)\b/i.test(text)) return "hi";
  return "en";
}

/** Look up a static fact for the given query. */
export function lookupFact(query: string): KnowledgeLookup {
  for (const fact of KNOWLEDGE_BASE) {
    if (fact.patterns.some((p) => p.test(query))) {
      const lang = detectLanguage(query);
      const answer =
        lang === "gu" && fact.answerGu ? fact.answerGu :
        lang === "hi" && fact.answerHi ? fact.answerHi :
        fact.answer;
      return { found: true, answer, answerGu: fact.answerGu, fact };
    }
  }
  return { found: false };
}

/** Quick check: does this query likely have a local knowledge answer? */
export function isKnowledgeQuery(query: string): boolean {
  const lower = query.toLowerCase();
  // Must match at least one fact keyword AND one pattern
  return KNOWLEDGE_BASE.some(
    (fact) =>
      fact.keywords.some((kw) => lower.includes(kw)) &&
      fact.patterns.some((p) => p.test(query))
  );
}
