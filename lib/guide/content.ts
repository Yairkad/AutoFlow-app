// Public tire & wheel guide (/guide/<token>). Each garage can edit the text and images from
// Settings → דף נחיתה → מדריך צמיגים; until it does, DEFAULT_GUIDE is shown.
// Body text format: one paragraph per line, lines starting with "- " are bullets, **bold** works.

export type Lang = 'he' | 'en'
export interface L { he: string; en: string }

export type DiagramKey = 'toe' | 'camber' | 'caster' | 'size' | 'dot' | 'puncture'

export interface GuideSection {
  id: string
  title: L
  body: L
  diagram?: DiagramKey | null
  image?: string | null        // data URL (compressed in the editor)
  imageCredit?: string | null  // shown under the image, e.g. "Image by X on Freepik"
}

export interface GuideTopic {
  id: string
  icon: 'alignment' | 'tire' | 'puncture'
  enabled: boolean
  /** cards = every section shown open; accordion = titles that open on tap */
  layout: 'cards' | 'accordion'
  title: L
  summary: L
  intro: L
  image?: string | null
  imageCredit?: string | null
  sections: GuideSection[]
}

export interface GuideContent {
  title: L
  lead: L
  footerNote: L
  topics: GuideTopic[]
}

const l = (he: string, en: string): L => ({ he, en })

export const DEFAULT_GUIDE: GuideContent = {
  title: l('מדריך הצמיגים והגלגלים', 'Tire & Wheel Guide'),
  lead:  l('כל מה שרצית לדעת על מה שעשינו לרכב שלך — בשפה פשוטה.', 'Everything you wanted to know about the work we did on your car — in plain words.'),
  footerNote: l('המידע כללי ואינו מחליף את הוראות יצרן הרכב.', 'General information; always follow your vehicle manufacturer\'s instructions.'),
  topics: [
    {
      id: 'alignment', icon: 'alignment', enabled: true, layout: 'cards',
      title:   l('כיוון פרונט', 'Wheel Alignment'),
      summary: l('מה זה קמבר, טואו וקסטר, ולמה הרכב "מושך" לצד', 'Camber, toe and caster — and why the car pulls to one side'),
      intro:   l(
        'כיוון פרונט הוא כוונון הזוויות של הגלגלים ביחס לכביש ולרכב, לפי נתוני היצרן. כשהזוויות לא מדויקות, הרכב מושך לצד, ההגה עקום והצמיגים נשחקים מהר ובצורה לא אחידה.',
        'Wheel alignment means adjusting the angles of the wheels relative to the road and the car, to the manufacturer\'s specs. When they\'re off, the car pulls to one side, the steering wheel sits crooked, and tires wear out fast and unevenly.'),
      sections: [
        { id: 'toe', diagram: 'toe', title: l('טואו (Toe)', 'Toe'),
          body: l('מבט מלמעלה: האם חזית הגלגלים פונה פנימה או החוצה. זו הזווית שהכי משפיעה על שחיקת הצמיגים.',
                  'Seen from above: whether the fronts of the wheels point inward or outward. The angle with the biggest effect on tire wear.') },
        { id: 'camber', diagram: 'camber', title: l('קמבר (Camber)', 'Camber'),
          body: l('מבט מלפנים: הטיית הגלגל פנימה או החוצה. קמבר לא נכון שוחק צד אחד של הצמיג.',
                  'Seen from the front: the inward or outward tilt of the wheel. Wrong camber wears one edge of the tire.') },
        { id: 'caster', diagram: 'caster', title: l('קסטר (Caster)', 'Caster'),
          body: l('מבט מהצד: הטיית ציר ההיגוי קדימה או אחורה. משפיע על היציבות בנסיעה ועל חזרת ההגה למרכז אחרי פנייה.',
                  'Seen from the side: the forward or backward tilt of the steering axis. Affects straight-line stability and how the wheel returns to center after a turn.') },
        { id: 'signs', title: l('סימנים שצריך כיוון', 'Signs you need an alignment'),
          body: l(
            '- הרכב מושך ימינה או שמאלה בנסיעה ישרה\n- ההגה לא ישר כשנוסעים ישר\n- שחיקה לא אחידה בצמיגים\n- אחרי עלייה על מדרכה או בור\n- אחרי החלפת חלקי מתלה או היגוי\n- בהחלפת צמיגים',
            '- The car pulls left or right on a straight road\n- The steering wheel is off-center when driving straight\n- Uneven tire wear\n- After hitting a curb or a pothole\n- After suspension or steering repairs\n- When fitting new tires') },
        { id: 'how-often', title: l('כל כמה זמן?', 'How often?'),
          body: l('מומלץ לבדוק פעם בשנה או כל 15,000–20,000 ק"מ.', 'Once a year or every 15,000–20,000 km.') },
      ],
    },
    {
      id: 'tires', icon: 'tire', enabled: true, layout: 'accordion',
      title:   l('מידע על הצמיגים', 'About Your Tires'),
      summary: l('איזון, מידת צמיג, תאריך ייצור, לחץ אוויר ומתי מחליפים', 'Balancing, tire size, age, pressure and when to replace'),
      intro:   l('לחצו על נושא כדי לפתוח אותו.', 'Tap a topic to open it.'),
      sections: [
        { id: 'balancing', title: l('איזון גלגלים', 'Wheel balancing'),
          body: l(
            'אף גלגל לא מושלם — תמיד יש אזור קצת יותר כבד. במכונת האיזון מסובבים את הגלגל, מאתרים את הנקודה הכבדה ומוסיפים משקולות קטנות בצד הנגדי, כך שהגלגל מסתובב חלק.\n**סימנים:**\n- רעד בהגה או במושב, בעיקר במהירות 80–120 קמ"ש\n- שחיקה "גלית" בצמיג\n**מתי:** בכל התקנה של צמיג חדש, אחרי תיקון פנצ\'ר, ואם משקולת נפלה.\n**לא לבלבל:** איזון מטפל ברעד, כיוון פרונט מטפל במשיכה לצד.',
            'No wheel is perfect — there is always a slightly heavier spot. The balancing machine spins the wheel, finds the heavy spot and adds small weights on the opposite side so the wheel turns smoothly.\n**Signs:**\n- Vibration in the steering wheel or seat, mostly at 80–120 km/h\n- Wavy ("cupped") tire wear\n**When:** every time a new tire is fitted, after a puncture repair, or if a weight fell off.\n**Don\'t mix them up:** balancing fixes vibration; alignment fixes pulling.') },
        { id: 'size', diagram: 'size', title: l('איך קוראים מידת צמיג', 'How to read a tire size'),
          body: l(
            'דוגמה: **205/55 R16 91V**\n- **205** — רוחב הצמיג במ"מ\n- **55** — גובה הדופן: 55% מהרוחב\n- **R** — מבנה רדיאלי\n- **16** — קוטר החישוק באינץ\'\n- **91** — מדד עומס: עד 615 ק"ג לצמיג\n- **V** — מדד מהירות: עד 240 קמ"ש\nאת המידה הנכונה לרכב תמצאו בספר הרכב או במדבקה במשקוף דלת הנהג. אסור להתקין צמיג עם מדד עומס או מהירות נמוכים מהנדרש.',
            'Example: **205/55 R16 91V**\n- **205** — tire width in mm\n- **55** — sidewall height: 55% of the width\n- **R** — radial construction\n- **16** — rim diameter in inches\n- **91** — load index: up to 615 kg per tire\n- **V** — speed rating: up to 240 km/h\nThe correct size for your car is in the owner\'s manual or on the sticker in the driver\'s door frame. Never fit a tire with a lower load index or speed rating than required.') },
        { id: 'dot', diagram: 'dot', title: l('תאריך ייצור (DOT)', 'Tire age (DOT code)'),
          body: l(
            'על דופן הצמיג מופיע קוד שמתחיל ב-DOT. **4 הספרות האחרונות** הן תאריך הייצור: שבוע ושנה.\nלדוגמה **2324** = השבוע ה-23 של שנת 2024.\nגומי מתיישן גם כשלא נוסעים עליו — ראו "מתי מחליפים צמיג".',
            'The sidewall carries a code starting with DOT. **The last 4 digits** are the production date: week and year.\nFor example **2324** = week 23 of 2024.\nRubber ages even when the tire isn\'t used — see "When to replace a tire".') },
        { id: 'pressure', title: l('לחץ אוויר', 'Tire pressure'),
          body: l(
            '- הלחץ הנכון לרכב שלך מופיע במדבקה במשקוף דלת הנהג או בספר הרכב — **לא** המספר שעל הצמיג (זה הלחץ המקסימלי).\n- בודקים כשהצמיגים קרים — לפני נסיעה או אחרי חניה של כמה שעות.\n- פעם בחודש ולפני נסיעה ארוכה, כולל הגלגל הרזרבי.\n- **לחץ נמוך:** שחיקה בשוליים, צריכת דלק גבוהה והתחממות הצמיג.\n- **לחץ גבוה:** שחיקה במרכז ופחות אחיזה.',
            '- The correct pressure for your car is on the sticker in the driver\'s door frame or in the owner\'s manual — **not** the number on the tire (that\'s the maximum).\n- Check when tires are cold — before driving or after a few hours parked.\n- Once a month and before long trips, including the spare.\n- **Too low:** edge wear, higher fuel use and tire overheating.\n- **Too high:** center wear and less grip.') },
        { id: 'replace', title: l('מתי מחליפים צמיג', 'When to replace a tire'),
          body: l(
            '- **עומק חריץ:** המינימום לפי החוק בישראל הוא 1.6 מ"מ. מומלץ להחליף כבר ב-3 מ"מ — בכביש רטוב מרחק הבלימה מתארך משמעותית.\n- **מחווני שחיקה:** בתוך החריצים יש "גשרים" קטנים. כשפני הצמיג מגיעים לגובה שלהם — מחליפים.\n- **צמיג ישן:** גם צמיג שנראה חדש מתיישן. מגיל 5 שנים כדאי לבדוק אותו כל שנה, ולהחליף לכל המאוחר בגיל 10 (לפי קוד ה-DOT).\n- **גומי יבש וסדוק:** סדקים קטנים בדופן או בין החריצים הם סימן שהגומי התייבש ואיבד גמישות ואחיזה — בעיקר ברכב שעומד הרבה בשמש.\n- **בליטה או "בועה" בדופן:** נזק פנימי במבנה הצמיג, לרוב אחרי מכה במדרכה או בבור. מחליפים מיד — גם אם הצמיג חדש.\n- **שחיקה לא אחידה:** סימן לבעיה בכיוון, באיזון או בלחץ האוויר — כדאי לבדוק גם את הסיבה.\n- רצוי להחליף בזוגות (שני קדמיים או שני אחוריים), ולהתקין את הצמיגים החדשים יותר מאחור.',
            '- **Tread depth:** the legal minimum in Israel is 1.6 mm. We recommend replacing at 3 mm — wet-road braking distance grows considerably.\n- **Wear indicators:** small "bridges" inside the grooves. When the tread is level with them — replace.\n- **Old tires:** even a tire that looks new ages. From 5 years old, have it checked every year, and replace it at 10 years at the latest (see the DOT code).\n- **Dry, cracked rubber:** small cracks in the sidewall or between the grooves mean the rubber has dried out and lost flexibility and grip — common on cars that sit in the sun a lot.\n- **A bulge or "bubble" in the sidewall:** internal damage to the tire\'s structure, usually after hitting a curb or pothole. Replace immediately — even if the tire is new.\n- **Uneven wear:** a sign of an alignment, balancing or pressure problem — have the cause checked too.\n- Preferably replace in pairs (both fronts or both rears), with the newer tires on the rear axle.') },
      ],
    },
    {
      id: 'puncture', icon: 'puncture', enabled: true, layout: 'cards',
      title:   l('תיקון פנצ\'ר', 'Puncture Repair'),
      summary: l('איפה מותר לתקן ואיפה אסור', 'Where a tire can and can\'t be repaired'),
      intro:   l('לא כל חור בצמיג אפשר לתקן. המיקום והגודל של החור קובעים אם התיקון בטוח.',
                 'Not every hole can be repaired. Where the hole is and how big it is decide whether a repair is safe.'),
      sections: [
        { id: 'zones', diagram: 'puncture', title: l('איפה מותר ואיפה אסור', 'Where it\'s allowed and where it isn\'t'),
          body: l(
            '- **מותר לתקן:** חור קטן (עד כ-6 מ"מ) באזור הדריכה — החלק האמצעי שנוגע בכביש (ירוק בציור).\n- **אסור לתקן:** חור בכתף הצמיג או בדופן (אדום בציור) — האזורים האלה מתגמשים כל הזמן, ותיקון שם לא מחזיק ומסוכן.',
            '- **Repairable:** a small hole (up to about 6 mm) in the tread area — the middle part that touches the road (green in the drawing).\n- **Not repairable:** a hole in the shoulder or sidewall (red in the drawing) — these areas flex all the time, so a repair there won\'t hold and is dangerous.') },
        { id: 'no-repair', title: l('מתי מחליפים ולא מתקנים', 'When to replace instead of repairing'),
          body: l(
            '- חתך ארוך או קרע\n- כמה חורים קרובים אחד לשני\n- צמיג שנסעו עליו כשהוא ריק לגמרי — הדופן נמעכת ונפגעת מבפנים, גם אם מבחוץ לא רואים\n- חור שתוקן כבר בעבר באותו מקום',
            '- A long cut or tear\n- Several holes close together\n- A tire that was driven completely flat — the sidewall gets crushed and damaged inside, even if nothing shows outside\n- A hole that was already repaired in the same spot') },
        { id: 'proper', title: l('איך עושים תיקון נכון', 'How a proper repair is done'),
          body: l(
            'תיקון נכון נעשה **מבפנים**: מורידים את הצמיג מהחישוק, בודקים שלא נגרם נזק פנימי, ומתקינים פלאג-פטץ\' שאוטם את החור לכל העומק. "פתיל" מבחוץ הוא פתרון זמני בלבד.\nאחרי התיקון — מאזנים את הגלגל מחדש.',
            'A proper repair is done **from the inside**: the tire is taken off the rim, checked for internal damage, and a plug-patch is fitted that seals the hole all the way through. An outside "string plug" is only a temporary fix.\nAfter the repair, the wheel is balanced again.') },
      ],
    },
  ],
}

/** Saved content, or the default. Topics missing from saved content (added in a later version) are appended. */
export function resolveGuide(saved: unknown): GuideContent {
  const s = saved as GuideContent | null
  if (!s || !Array.isArray(s.topics)) return DEFAULT_GUIDE
  const ids = new Set(s.topics.map(t => t.id))
  return { ...DEFAULT_GUIDE, ...s, topics: [...s.topics, ...DEFAULT_GUIDE.topics.filter(t => !ids.has(t.id))] }
}

export const pick = (v: L | undefined, lang: Lang) => (lang === 'en' ? v?.en?.trim() || v?.he : v?.he) ?? ''
