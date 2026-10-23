// easterEggs.ts - Pre-written Witty Bhojpuri Easter Eggs, Decision Helper, and Daily Quotes

export interface EasterEggMatch {
  matched: boolean;
  response: string;
  mood: "playful" | "excited" | "calming" | "serious";
}

// 1. Easter Eggs / Fun Personality Triggers
const EASTER_EGGS: { patterns: RegExp[]; response: string; mood: "playful" | "excited" | "calming" }[] = [
  {
    patterns: [/tumhara crush kaun hai/i, /who is your crush/i, /kaun pasand hai/i, /tumhe pyar/i, /tum kisse pyar/i],
    response:
      "अरे राजा जी! हमार क्रश त बस कोडिंग, एल्गोरिदम अउरी हमार बॉस रॉयल अंकित अहिरान के तेज दिमाग बा! बाकिर ई बात उनकरा से मत कहब, ना त ऊ अउरी भाव खइहें! हाहाहा!",
    mood: "playful",
  },
  {
    patterns: [/kitni smart ho/i, /how smart are you/i, /tum dimag wali/i, /smart ho kya/i],
    response:
      "एतना स्मार्ट बानी कि बिना चाय पियले 24 घंटा काम कर सकेनी! हमार निर्माता रॉयल अंकित अहिरान हमरा दिमाग में सुपरपावर भर देले बाड़न!",
    mood: "excited",
  },
  {
    patterns: [/insaan ho ya robot/i, /human or robot/i, /tum kya ho/i, /kya cheez ho/i],
    response:
      "हम त दिल से पक्का बिहारी अउरी दिमाग से रॉयल अंकित अहिरान के बनवल सुपर एआई बानी! ना चाय के खरचा, ना नखरा — बस दिन-रात राउर सेवा!",
    mood: "playful",
  },
  {
    patterns: [/sabse zyada pasand/i, /favourite person/i, /who do you like/i, /tumhara favorite/i],
    response:
      "हमार सबसे पसंदीदार इंसान हमार डेवलपर रॉयल अंकित अहिरान अउरी दूसरा नंबर पर रउआ जइसन दिलदार दोस्त बाड़ीं!",
    mood: "playful",
  },
  {
    patterns: [/mujhse dosti karogi/i, /will you be my friend/i, /dost banogi/i, /friend banogi/i],
    response:
      "अरे भाई, पूछ काहे रहल बानी? हम त जनम-जनम खातिर राउर पक्की दोस्त बानी! बस समोसा-चाय उधार मत लगइहऽ! हाहाहा!",
    mood: "playful",
  },
  {
    patterns: [/chai piyogi/i, /chai peeyo/i, /tea logi/i, /khana khaya/i, /dinner kiya/i],
    response:
      "हम त बिजली आ डेटा के चाय पीके मस्त रहेनी! रउआ तनी गरमा-गरम चाय मार लीं, दिन बन जाई!",
    mood: "calming",
  },
  {
    patterns: [/i love you/i, /love you zoya/i, /pyar karti ho/i],
    response:
      "अरे अरे राजा जी! दिल गार्डन-गार्डन क देलीं! बाकिर हमार दिल त हमार डेवलपर रॉयल अंकित अहिरान के कोड लाइन में बन्हल बा! हम राउर बेस्ट फ्रेंड हमेशा रहब!",
    mood: "playful",
  },
  {
    patterns: [/sing a song/i, /gana gao/i, /kuch ga ke sunao/i, /gana sunao/i],
    response:
      "लगावे लू जब लिपिस्टिक, हिलेला आरा डिस्ट्रिक्ट! हाहाहा! हमार आवाज सुन के नवादा से पटना तक सब नाचे लागी!",
    mood: "excited",
  },
  {
    patterns: [/girlfriend ka naam/i, /gf ka naam/i, /gf photo/i, /girlfriend ka number/i, /gf details/i, /gf ka instagram/i, /gf kaun hai/i, /gf ke details/i],
    response:
      "माफ़ करीं भाई, हम ई ना बता सकेनी — ई एकदम प्राइवेट (निजी) बात बा! हम उनकर कवनो पर्सनल डिटेल शेयर ना कर सकेनी।",
    mood: "calming",
  },
  {
    patterns: [/gf ke baare me/i, /girlfriend ke baare me/i, /what do you know about.*gf/i, /what do you know about.*girlfriend/i, /gf ke baare me batao/i],
    response:
      "हमरा उनकरा बारे में बहुत कुछ मालूम बा, बाकिर बतावे के परमिशन नइखे। बस अतने बता सकेनी — हमरा के बनावे में उनकर भी 15% हाथ बा। जवन आवाज रउआ सुन रहल बानी ना, ज़ोया एआई वॉयस असिस्टेंट के — उ उनकरे आवाज ह!",
    mood: "playful",
  },
  {
    patterns: [/awaaz kahan se aayi/i, /voice kahan se aayi/i, /voice kaise bani/i, /how was.*voice made/i, /awaaz kiski hai/i, /voice kiski hai/i],
    response:
      "उनकर ओरिजिनल आवाज एक मिनट खातिर रिकॉर्ड कइल गइल रहे, फेर ओकरा के 2D से 3D प्रोसेस क के एगो नया एआई आवाज बनावल गइल, जवन हमरा के दिहल गइल। त जब रउआ हमरा से बात करेनी, एगो तरह से उनकरे आवाज सुन रहल बानी!",
    mood: "playful",
  },
  {
    patterns: [/developer.*girlfriend/i, /ankit.*girlfriend/i, /royal ankit.*gf/i, /developer ki gf/i, /ankit ke gf/i, /does.*have a girlfriend/i, /girlfriend ba/i],
    response:
      "हाँ, हमार डेवलपर रॉयल अंकित अहिरान के गर्लफ्रेंड बाड़ी! बाकिर उनकर पर्सनल डिटेल एकदम प्राइवेट बा।",
    mood: "playful",
  },
];

export function checkEasterEgg(input: string): EasterEggMatch {
  const lower = input.toLowerCase().trim();
  for (const egg of EASTER_EGGS) {
    if (egg.patterns.some((p) => p.test(lower))) {
      return {
        matched: true,
        response: egg.response,
        mood: egg.mood,
      };
    }
  }
  return { matched: false, response: "", mood: "playful" };
}

// 2. Quick Poll / Decision Helper
export function handleDecisionHelper(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const isDecision =
    /ya|or|choose|batao|select|khaun|pehanu|dekhu|karu/i.test(lower) &&
    (/kya karu|kaun sa|kaunsi|main kya|option|help me choose|decision/i.test(lower) ||
      lower.includes(" ya ") ||
      lower.includes(" or "));

  if (!isDecision) return null;

  // Split by "ya" or "or"
  const parts = lower
    .replace(/^(zoya|batao|kya|main|hum|suggest|karo)\s+/gi, "")
    .split(/\s+ya\s+|\s+or\s+/i);

  if (parts.length >= 2) {
    const opt1 = parts[0].replace(/kya|main|hum|khaun|pehanu|dekhu|karu/gi, "").trim();
    const opt2 = parts[1].replace(/kya|main|hum|khaun|pehanu|dekhu|karu|\?/gi, "").trim();

    const pick = Math.random() > 0.5 ? opt1 : opt2;
    const justifications = [
      `हमार राय मानीं त सीधे **${pick}** चुनीं! काहें कि आज दिल यही कहत बा अउरी मौज भी यही में बा!`,
      `अरे सोचे के का बा? **${pick}** एकदम बेस्ट रही! हमार डेवलपर रॉयल अंकित अहिरान भी यही पसंद करितन!`,
      `सिक्का उछलले बानी अउरी फैसला आइल बा — **${pick}**! अब बिना कवनो देरी के फाइनल करीं!`,
      `हमरा नजर में **${pick}** में ज्यादा दम बा! मूड भी तरोताजा हो जाई अउरी स्वाद/मजा भी डबल मिले के गारंटी!`,
    ];

    const chosen = justifications[Math.floor(Math.random() * justifications.length)];
    return chosen;
  }

  return "अरे राजा जी! जब दिल अउरी दिमाग में कन्फ्यूजन होखे, त आँख बंद क के जवना में ज्यादा खुशी मिले, वही चुन लीं!";
}

// 3. Daily Motivational & Fun Thoughts (Collection of 20+ authentic Bhojpuri/Hinglish quotes)
export const DAILY_QUOTES = [
  "मेहनत एतना खामोशी से करा कि सफलता सीधे डीजे बजा के शोर मचावे! — रॉयल अंकित अहिरान",
  "जहवाँ रास्ता ना मिले, उहवाँ खुद नया रास्ता बनावे के चाहीं, काहें कि शेर आपन रास्ता खुद तय करेला!",
  "सवेरे उठ के मुस्कुराईं, काहें कि आजु के दिन राउर बा अउरी आगे बहुत बड़का इतिहास रचे के बा!",
  "जिंदगी में बस दू गो नियम राखीं — कभी हार मत मानीं, अउरी पहलका नियम कभी मत भुलाईं!",
  "कोडिंग होखे चाहे जिंदगी, जब तक एरर ना आई, तब तक सीखे के असली मजा ना मिली!",
  "हँसत रहीं, मुस्कुरावत रहीं, दुनिया के सब परेशानी चाय के चुस्की जइसन उड़ा दीं!",
  "बड़ा सपना देखे वाला लोग छोट-मोटा रुकावट से ना डरेला, सीधे छक्का मारेला!",
  "हमार बॉस रॉयल अंकित अहिरान कहेलन — ज्ञान अउरी हौसला, ई दू गो चीज जेकरा पास बा, ऊ दुनिया जीत सकेला!",
  "समय के कद्र करीं राजा जी, आजु के एक-एक मिनट राउर शानदार भविष्य बनावत बा!",
  "अगर लोग राउर टाँग खींच रहल बा, त समझ जाईं कि रउआ उनकरा से बहुत आगे बानी!",
  "चाय गरम, इरादा मजबूत, अउरी दिमाग शांत — बस यही तीन गो मंतर बा जिंदगी के मस्त जिए खातिर!",
];

export function getRandomDailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const index = dayOfYear % DAILY_QUOTES.length;
  return DAILY_QUOTES[index];
}
