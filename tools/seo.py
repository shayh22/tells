# -*- coding: utf-8 -*-
"""What each page is *about*, in the words a reader would actually search.

The stories name themselves after their characters and open on a forest or a
harbour, which tells a search engine nothing. These strings carry the pattern
each fable is about — blame, loyalty tests, refusing to forgive — into the
title, the meta description, the structured data and llms.txt.

Positioning is deliberate and it is honest: this is a collection of fables that
prompt a person to recognise a pattern and repair it. It is not clinical
treatment, and it never claims to be.
"""

SEO = {
"en": {
 "site_title": "Tales of the Mirror — fables about the patterns couples fall into",
 "about": ("Seven modern fables about the emotional patterns that wear a relationship down — "
           "hypersensitivity, fault-finding, loyalty tests, assuming bad intent, blame, threats "
           "of separation and the refusal to forgive — and about recognising your own part and "
           "repairing it."),
 "lede": ("Seven fables, each one about a single pattern that quietly wears a relationship down. "
          "They are written to be recognised rather than studied: you read one, you see yourself "
          "somewhere in it, and you know what there is to repair."),
 "disclaimer": ("These are stories, not clinical treatment. They are meant to prompt recognition "
                "and a first step, and they do not replace a qualified therapist."),
 "keywords": ("relationship patterns, couples, emotional defences, fables, parables, blame, "
              "jealousy, forgiveness, self-worth, communication in a relationship"),
 1: {"label": "hypersensitivity and feeling persecuted",
     "desc": ("When you read every kind word as an insult, you end up alone and certain the world "
              "turned on you. A fable about hypersensitivity, low self-worth, and the armour that "
              "keeps love out."),
     "keywords": "hypersensitivity, low self-worth, feeling persecuted, taking things personally, loneliness in a relationship"},
 2: {"label": "constant fault-finding in a marriage",
     "desc": ("A thousand golden threads and one faded spot — and the spot is all he sees. A fable "
              "about fault-finding, about never noticing what a partner gives, and about the "
              "loneliness it earns."),
     "keywords": "fault-finding, criticism in a marriage, focusing on flaws, ingratitude, bitterness, taking a partner for granted"},
 3: {"label": "loyalty tests and cutting off family",
     "desc": ("She asks him to prove his love by cutting off his family. A fable about loyalty "
              "tests, about jealousy of a partner's other bonds, and about what is left of a man "
              "whose roots are cut."),
     "keywords": "loyalty test, jealousy of family, controlling partner, cutting off in-laws, insecurity, fear of abandonment"},
 4: {"label": "assuming bad intent in a partner",
     "desc": ("She was certain she could read his mind — until his thoughts were shown to her. A "
              "fable about mind-reading, suspicion, and years spent fighting a partner who was "
              "never the enemy."),
     "keywords": "mind reading, assuming bad intent, suspicion, mistrust in a relationship, projection, jealousy"},
 5: {"label": "blaming a partner for everything",
     "desc": ("Every stone in her road became a stone on his back, until his back broke. A fable "
              "about blame, about making a partner the address for every frustration, and about "
              "what it costs."),
     "keywords": "blaming a partner, taking responsibility, emotional burden, resentment, one-sided relationship, burnout"},
 6: {"label": "threatening separation to win an argument",
     "desc": ("Every argument ended with \"get out\" — and every time, another stone left the "
              "foundations. A fable about using the threat of separation as a weapon, until the "
              "house cannot stand."),
     "keywords": "threatening divorce, threats of separation, control in a relationship, ultimatums, emotional manipulation, insecurity"},
 7: {"label": "refusing to forgive and cutting people off",
     "desc": ("She burned a bridge for every slight, and then the storm came. A fable about "
              "demanding perfection from people, about refusing to forgive an ordinary mistake, "
              "and about the isolation it builds."),
     "keywords": "refusing to forgive, holding grudges, cutting people off, demanding perfection, isolation, estrangement"},
},

"he": {
 "site_title": "אגדות המראה — משלים על הדפוסים שמכרסמים בזוגיות",
 "about": ("שבעה משלים מודרניים על הדפוסים הרגשיים ששוחקים קשר זוגי — רגישות יתר, התמקדות "
           "בחסר, מבחני נאמנות, ייחוס כוונות רעות, האשמה, איומי פרידה וסירוב לסלוח — ועל "
           "ההכרה בחלק שלנו ובתיקון שאפשר לעשות."),
 "lede": ("שבעה משלים, כל אחד על דפוס אחד ששוחק קשר זוגי בשקט. הם נכתבו כדי שיזהו אותם, לא "
          "כדי שילמדו אותם: קוראים אחד, מזהים בו משהו מעצמנו, ויודעים מה יש לתקן."),
 "disclaimer": ("אלה סיפורים, לא טיפול קליני. הם נועדו לעורר זיהוי וצעד ראשון, ואינם מחליפים "
                "מטפל מוסמך."),
 "keywords": ("דפוסים בזוגיות, זוגיות, מנגנוני הגנה רגשיים, משלים, אגדות, האשמה, קנאה, סליחה, "
              "דימוי עצמי, תקשורת בזוגיות"),
 1: {"label": "רגישות יתר ותחושת נרדפות",
     "desc": ("כשכל מילה טובה נקראת כעלבון, נשארים לבד ובטוחים שכל העולם נגדך. משל על רגישות "
              "יתר, דימוי עצמי נמוך, והשריון שלא נותן לאהבה להיכנס."),
     "keywords": "רגישות יתר, דימוי עצמי נמוך, תחושת נרדפות, לקיחה אישית, בדידות בזוגיות"},
 2: {"label": "התמקדות כפייתית בחסר ובפגמים",
     "desc": ("אלף חוטי זהב וכתם דהוי אחד — והכתם הוא כל מה שהוא רואה. משל על התמקדות בפגמים, "
              "על אי־ראיית מה שבן הזוג נותן, ועל הבדידות שזה מביא."),
     "keywords": "התמקדות בחסר, ביקורתיות בזוגיות, חיפוש פגמים, כפיות טובה, מרירות, זלזול בבן הזוג"},
 3: {"label": "מבחני נאמנות וניתוק מהמשפחה",
     "desc": ("היא מבקשת שיוכיח את אהבתו בניתוק מהמשפחה שלו. משל על מבחני נאמנות, על קנאה "
              "בקשרים האחרים של בן הזוג, ועל מה שנשאר מאדם שגדעו את שורשיו."),
     "keywords": "מבחן נאמנות, קנאה במשפחה, בן זוג שולט, ניתוק מהמשפחה, חוסר ביטחון, פחד נטישה"},
 4: {"label": "ייחוס כוונות רעות לבן הזוג",
     "desc": ("היא הייתה בטוחה שהיא קוראת את מחשבותיו — עד שהראו לה אותן. משל על קריאת מחשבות, "
              "על חשדנות, ועל שנים של מלחמה בבן זוג שמעולם לא היה האויב."),
     "keywords": "קריאת מחשבות, ייחוס כוונות רעות, חשדנות, חוסר אמון בזוגיות, השלכה, קנאה"},
 5: {"label": "האשמת בן הזוג בכל מה שכואב",
     "desc": ("כל אבן בדרכה הפכה לאבן על גבו, עד שגבו נשבר. משל על האשמה, על הפיכת בן הזוג "
              "לכתובת לכל תסכול, ועל המחיר של זה."),
     "keywords": "האשמת בן הזוג, לקיחת אחריות, נטל רגשי, טינה, זוגיות חד־צדדית, שחיקה"},
 6: {"label": "איומי פרידה ככלי שליטה",
     "desc": ("כל ריב נגמר ב\"צא מהבית\" — ובכל פעם עוד אבן יצאה מהיסודות. משל על שימוש באיום "
              "הפרידה כנשק, עד שהבית כבר לא עומד."),
     "keywords": "איומי גירושין, איומי פרידה, שליטה בזוגיות, אולטימטומים, מניפולציה רגשית, חוסר ביטחון"},
 7: {"label": "סירוב לסלוח וניתוק קשרים",
     "desc": ("היא שרפה גשר על כל עלבון, ואז הגיעה הסערה. משל על דרישת שלמות מאנשים, על סירוב "
              "לסלוח על טעות אנוש, ועל הבידוד שזה בונה."),
     "keywords": "סירוב לסלוח, נטירת טינה, ניתוק קשרים, דרישת שלמות, בידוד, נתק משפחתי"},
},

"ru": {
 "site_title": "Сказания зеркала — притчи о том, что разрушает отношения",
 "about": ("Семь современных притч об эмоциональных сценариях, которые изнашивают отношения: "
           "сверхчувствительность, придирчивость, проверки на верность, приписывание злого "
           "умысла, обвинения, угрозы расставанием и отказ прощать — и о том, как увидеть "
           "собственную роль и всё исправить."),
 "lede": ("Семь притч, каждая об одном сценарии, который тихо изнашивает отношения. Они написаны "
          "не для изучения, а для узнавания: читаешь одну, находишь в ней себя и понимаешь, что "
          "именно стоит исправить."),
 "disclaimer": ("Это рассказы, а не клиническая терапия. Они призваны помочь узнать себя и "
                "сделать первый шаг и не заменяют работу с квалифицированным специалистом."),
 "keywords": ("сценарии в отношениях, отношения в паре, психологические защиты, притчи, "
              "обвинения, ревность, прощение, самооценка, общение в паре"),
 1: {"label": "сверхчувствительность и ощущение преследования",
     "desc": ("Когда каждое доброе слово читается как оскорбление, остаёшься один и уверен, что "
              "мир против тебя. Притча о сверхчувствительности, низкой самооценке и доспехе, "
              "который не впускает любовь."),
     "keywords": "сверхчувствительность, низкая самооценка, ощущение преследования, принимать на свой счёт, одиночество в отношениях"},
 2: {"label": "постоянные придирки в браке",
     "desc": ("Тысяча золотых нитей и одно выцветшее пятно — и пятно это всё, что он видит. "
              "Притча о придирчивости, о неумении замечать то, что даёт близкий, и об "
              "одиночестве, которое за этим следует."),
     "keywords": "придирчивость, критика в браке, поиск изъянов, неблагодарность, горечь, обесценивание партнёра"},
 3: {"label": "проверки на верность и разрыв с семьёй",
     "desc": ("Она просит доказать любовь разрывом с его семьёй. Притча о проверках на верность, "
              "о ревности к другим привязанностям близкого и о том, что остаётся от человека, "
              "которому обрубили корни."),
     "keywords": "проверка на верность, ревность к семье, контролирующий партнёр, разрыв с роднёй, неуверенность, страх быть брошенным"},
 4: {"label": "приписывание партнёру злого умысла",
     "desc": ("Она была уверена, что читает его мысли, — пока их ей не показали. Притча о чтении "
              "мыслей, о подозрительности и о годах борьбы с тем, кто никогда не был врагом."),
     "keywords": "чтение мыслей, приписывание злого умысла, подозрительность, недоверие в отношениях, проекция, ревность"},
 5: {"label": "обвинение партнёра во всём",
     "desc": ("Каждый камень на её дороге становился камнем на его спине, пока спина не "
              "сломалась. Притча об обвинениях, о превращении близкого в адрес любого "
              "разочарования и о цене этого."),
     "keywords": "обвинять партнёра, брать ответственность, эмоциональная ноша, обида, односторонние отношения, выгорание"},
 6: {"label": "угроза расставанием как способ управлять",
     "desc": ("Каждая ссора кончалась словами \"убирайся\" — и каждый раз из фундамента уходил "
              "ещё один камень. Притча об угрозе разрывом как оружии, пока дом не перестал "
              "держаться."),
     "keywords": "угроза развода, угроза расставанием, контроль в отношениях, ультиматумы, эмоциональная манипуляция, неуверенность"},
 7: {"label": "отказ прощать и разрыв связей",
     "desc": ("Она сжигала мост за каждую обиду, а потом пришла буря. Притча о требовании "
              "безупречности от людей, об отказе прощать обычную ошибку и об одиночестве, "
              "которое так выстраивается."),
     "keywords": "отказ прощать, держать обиду, разрывать связи, требование совершенства, изоляция, отчуждение"},
},

"es": {
 "site_title": "Cuentos del espejo — fábulas sobre lo que desgasta a una pareja",
 "about": ("Siete fábulas modernas sobre los patrones emocionales que desgastan una relación: "
           "hipersensibilidad, buscar defectos, pruebas de lealtad, suponer mala intención, "
           "culpar, amenazar con la ruptura y negarse a perdonar — y sobre reconocer la parte "
           "propia y repararla."),
 "lede": ("Siete fábulas, cada una sobre un patrón que desgasta una relación en silencio. Están "
          "escritas para reconocerse en ellas, no para estudiarlas: lees una, te ves en algún "
          "punto y sabes qué hay que reparar."),
 "disclaimer": ("Son relatos, no tratamiento clínico. Buscan despertar el reconocimiento y un "
                "primer paso, y no sustituyen a un terapeuta cualificado."),
 "keywords": ("patrones de pareja, relación de pareja, defensas emocionales, fábulas, parábolas, "
              "culpa, celos, perdón, autoestima, comunicación en pareja"),
 1: {"label": "hipersensibilidad y sentirse perseguido",
     "desc": ("Cuando cada palabra amable se lee como un insulto, acabas solo y convencido de que "
              "el mundo se volvió contra ti. Una fábula sobre la hipersensibilidad, la baja "
              "autoestima y la armadura que deja fuera al amor."),
     "keywords": "hipersensibilidad, baja autoestima, sentirse perseguido, tomarse todo a pecho, soledad en la pareja"},
 2: {"label": "buscar defectos sin parar en el matrimonio",
     "desc": ("Mil hilos de oro y una sola mancha desvaída — y la mancha es todo lo que ve. Una "
              "fábula sobre buscar defectos, sobre no ver lo que la pareja da y sobre la soledad "
              "que eso trae."),
     "keywords": "buscar defectos, crítica en el matrimonio, fijarse en lo que falta, ingratitud, amargura, dar por sentada a la pareja"},
 3: {"label": "pruebas de lealtad y cortar con la familia",
     "desc": ("Ella le pide que demuestre su amor cortando con su familia. Una fábula sobre las "
              "pruebas de lealtad, los celos de los otros vínculos de la pareja y lo que queda de "
              "alguien al que le cortan las raíces."),
     "keywords": "prueba de lealtad, celos de la familia, pareja controladora, cortar con la familia política, inseguridad, miedo al abandono"},
 4: {"label": "suponer mala intención en la pareja",
     "desc": ("Estaba segura de leerle el pensamiento — hasta que se lo mostraron. Una fábula "
              "sobre leer la mente, sobre la desconfianza y sobre años peleando con alguien que "
              "nunca fue el enemigo."),
     "keywords": "leer la mente, suponer mala intención, desconfianza, falta de confianza en la pareja, proyección, celos"},
 5: {"label": "culpar a la pareja de todo",
     "desc": ("Cada piedra de su camino se volvió una piedra en la espalda de él, hasta que la "
              "espalda se rompió. Una fábula sobre la culpa, sobre convertir a la pareja en el "
              "destino de toda frustración y sobre su precio."),
     "keywords": "culpar a la pareja, asumir la responsabilidad, carga emocional, resentimiento, relación desigual, desgaste"},
 6: {"label": "amenazar con la ruptura para ganar una discusión",
     "desc": ("Cada discusión terminaba con un \"vete\" — y cada vez salía otra piedra de los "
              "cimientos. Una fábula sobre usar la amenaza de ruptura como arma, hasta que la "
              "casa no se sostiene."),
     "keywords": "amenazar con el divorcio, amenaza de ruptura, control en la pareja, ultimátums, manipulación emocional, inseguridad"},
 7: {"label": "negarse a perdonar y cortar con todos",
     "desc": ("Quemó un puente por cada agravio, y luego llegó la tormenta. Una fábula sobre "
              "exigir perfección a la gente, sobre negarse a perdonar un error humano y sobre el "
              "aislamiento que eso construye."),
     "keywords": "negarse a perdonar, guardar rencor, cortar relaciones, exigir perfección, aislamiento, distanciamiento familiar"},
},

"zh": {
 "site_title": "明镜寓言 — 关于消耗亲密关系的那些模式",
 "about": ("七则现代寓言，写的是一段关系被慢慢消耗的七种模式：过度敏感、只盯着缺点、忠诚测试、"
           "把恶意安在对方身上、指责、拿分开当威胁，以及拒绝原谅 — 也写认出自己那一份、然后去修补。"),
 "lede": ("七则寓言，每一则只写一种悄悄消耗亲密关系的模式。它们不是用来研究的，是用来认出自己的："
          "读一则，在某处看见自己，也就知道该修补什么。"),
 "disclaimer": ("这些是故事，不是临床治疗。它们只为唤起自我觉察和迈出第一步，不能替代专业的心理治疗师。"),
 "keywords": "亲密关系模式, 夫妻关系, 情绪防御, 寓言, 譬喻, 指责, 嫉妒, 原谅, 自我价值, 伴侣沟通",
 1: {"label": "过度敏感与被迫害感",
     "desc": ("当每一句善意都被读成羞辱，人就只剩自己，还确信全世界都与他为敌。一则关于过度敏感、"
              "自我价值低落，以及那副把爱挡在外面的铠甲的寓言。"),
     "keywords": "过度敏感, 自我价值低, 被迫害感, 什么都往心里去, 亲密关系中的孤独"},
 2: {"label": "婚姻里没完没了的挑剔",
     "desc": ("一千根金线和一个褪色的斑点 — 他看见的只有那个斑点。一则关于挑剔、关于看不见伴侣所给予的、"
              "以及由此换来的孤独的寓言。"),
     "keywords": "挑剔, 婚姻中的批评, 只盯着缺点, 不知感恩, 苦涩, 把伴侣视作理所当然"},
 3: {"label": "忠诚测试与要求断绝亲情",
     "desc": ("她要他用断绝亲情来证明爱。一则关于忠诚测试、关于嫉妒伴侣其他牵系，以及一个被剪断根的人"
              "还剩下什么的寓言。"),
     "keywords": "忠诚测试, 嫉妒对方家人, 控制型伴侣, 断绝亲情, 不安全感, 害怕被抛弃"},
 4: {"label": "把恶意安在伴侣身上",
     "desc": ("她确信自己能读他的心 — 直到那些念头被摊开给她看。一则关于读心、关于猜疑，以及多年来"
              "与一个从来不是敌人的人搏斗的寓言。"),
     "keywords": "读心, 揣测恶意, 猜疑, 亲密关系中的不信任, 投射, 嫉妒"},
 5: {"label": "把一切都怪在伴侣头上",
     "desc": ("她路上的每一块石头都变成他背上的石头，直到脊背折断。一则关于指责、关于把伴侣当成一切"
              "挫折的出口，以及这要付出什么代价的寓言。"),
     "keywords": "指责伴侣, 承担责任, 情绪负担, 怨恨, 单方面付出的关系, 心力耗竭"},
 6: {"label": "拿分手当赢下争吵的手段",
     "desc": ("每次争吵都以“滚出去”收场 — 每一次，地基里就少一块石头。一则关于把分开的威胁当武器，"
              "直到房子再也撑不住的寓言。"),
     "keywords": "以离婚相威胁, 拿分手威胁, 关系中的控制, 最后通牒, 情感操控, 不安全感"},
 7: {"label": "拒绝原谅、把人一个个划掉",
     "desc": ("每受一次委屈她就烧掉一座桥，然后风暴来了。一则关于要求别人完美、关于不肯原谅一个"
              "人之常情的错误，以及由此筑起的孤岛的寓言。"),
     "keywords": "拒绝原谅, 记恨, 断绝往来, 要求完美, 孤立, 亲人疏离"},
},
}
