export interface ContactEntry {
  id: string;
  name: string;
  phone: string;
  normalizedName: string;
  lastTwoDigits: string;
  label?: string;
  relation?: string;
  birthday?: string; // MM-DD or YYYY-MM-DD
}

export interface PendingDuplicateCall {
  contactName: string;
  matches: ContactEntry[];
  timestamp: number;
}

export interface CallOverlayState {
  isOpen: boolean;
  status: "searching" | "multiple_matches" | "calling" | "connected" | "ended";
  query: string;
  targetContact?: ContactEntry;
  multipleMatches?: ContactEntry[];
  message?: string;
  phoneNumber?: string;
  duration?: number;
}

const CONTACTS_STORAGE_KEY = "zoya_phone_contacts_v2";

// Default pre-populated phone contacts (Realistic duplicates and relationships for testing and real use)
export const DEFAULT_CONTACTS: ContactEntry[] = [
  // Father / Papa (Multiple numbers with different endings)
  {
    id: "c-father-1",
    name: "Father (Papa)",
    phone: "+91 98350 12345",
    normalizedName: "father papa",
    lastTwoDigits: "45",
    label: "Home / Airtel",
    relation: "father",
  },
  {
    id: "c-father-2",
    name: "Father (Office)",
    phone: "+91 98120 99992",
    normalizedName: "father office papa",
    lastTwoDigits: "92",
    label: "Work / Office",
    relation: "father",
  },
  {
    id: "c-father-3",
    name: "Papa (Personal)",
    phone: "+91 97711 55578",
    normalizedName: "papa personal bauji",
    lastTwoDigits: "78",
    label: "Personal / Jio",
    relation: "father",
  },

  // Big Sister / Sister / Didi (With number ending in 75!)
  {
    id: "c-sister-1",
    name: "Big Sister (Didi)",
    phone: "+91 98351 23475",
    normalizedName: "big sister didi badi didi",
    lastTwoDigits: "75",
    label: "Personal / Airtel",
    relation: "sister",
    birthday: "08-16",
  },
  {
    id: "c-sister-2",
    name: "Big Sister (Work)",
    phone: "+91 99341 87618",
    normalizedName: "big sister work didi",
    lastTwoDigits: "18",
    label: "Office / Jio",
    relation: "sister",
    birthday: "10-24",
  },
  {
    id: "c-sister-3",
    name: "Chhoti Behan (Sister)",
    phone: "+91 97712 34560",
    normalizedName: "sister chhoti behan didi",
    lastTwoDigits: "60",
    label: "Home / Vodafone",
    relation: "sister",
    birthday: "04-12",
  },

  // Sonu Kumar (Multiple numbers with different endings)
  {
    id: "c-sonu-1",
    name: "Sonu Kumar",
    phone: "+91 98765 43252",
    normalizedName: "sonu kumar",
    lastTwoDigits: "52",
    label: "Airtel",
    relation: "friend",
  },
  {
    id: "c-sonu-2",
    name: "Sonu Kumar",
    phone: "+91 98123 45688",
    normalizedName: "sonu kumar",
    lastTwoDigits: "88",
    label: "Jio",
    relation: "friend",
  },
  {
    id: "c-sonu-3",
    name: "Sonu Kumar",
    phone: "+91 99345 67848",
    normalizedName: "sonu kumar",
    lastTwoDigits: "48",
    label: "Work",
    relation: "friend",
  },
  {
    id: "c-sonu-4",
    name: "Sonu Kumar",
    phone: "+91 97234 56719",
    normalizedName: "sonu kumar",
    lastTwoDigits: "19",
    label: "Personal",
    relation: "friend",
  },

  // Mother / Mummy
  {
    id: "c-mummy-1",
    name: "Mummy",
    phone: "+91 98350 67890",
    normalizedName: "mummy mother maa",
    lastTwoDigits: "90",
    label: "Home",
    relation: "mother",
  },
  {
    id: "c-mummy-2",
    name: "Mummy (Jio)",
    phone: "+91 97715 44321",
    normalizedName: "mummy jio mother",
    lastTwoDigits: "21",
    label: "Jio",
    relation: "mother",
  },

  // Brother / Bhai
  {
    id: "c-bhai-1",
    name: "Bhai (Brother)",
    phone: "+91 99550 11223",
    normalizedName: "bhai brother bhaiya",
    lastTwoDigits: "23",
    label: "Mobile",
    relation: "brother",
  },

  // Friends / Work
  {
    id: "c-rohan-1",
    name: "Rohan Singh",
    phone: "+91 98234 56789",
    normalizedName: "rohan singh",
    lastTwoDigits: "89",
    label: "Mobile",
  },
  {
    id: "c-amit-1",
    name: "Amit Sharma",
    phone: "+91 97345 67812",
    normalizedName: "amit sharma",
    lastTwoDigits: "12",
    label: "Mobile",
  },
  {
    id: "c-amit-2",
    name: "Amit Sharma",
    phone: "+91 96456 78934",
    normalizedName: "amit sharma",
    lastTwoDigits: "34",
    label: "Office",
  },
  {
    id: "c-rahul-1",
    name: "Rahul Verma",
    phone: "+91 98711 22334",
    normalizedName: "rahul verma",
    lastTwoDigits: "34",
    label: "Friend",
  },

  // Chacha / Kaka / Uncle
  {
    id: "c-chacha-1",
    name: "Chacha (Village)",
    phone: "+91 98352 11422",
    normalizedName: "chacha kaka uncle chachaji",
    lastTwoDigits: "22",
    label: "Village / Airtel",
    relation: "chacha",
  },
  {
    id: "c-chacha-2",
    name: "Chacha (Patna)",
    phone: "+91 97713 88965",
    normalizedName: "chacha kaka uncle chacha patna",
    lastTwoDigits: "65",
    label: "Patna / Jio",
    relation: "chacha",
  },

  // Mausa / Mausi / Uncle
  {
    id: "c-mausa-1",
    name: "Mausa Ji",
    phone: "+91 99342 66733",
    normalizedName: "mausa mausa ji uncle mausaji",
    lastTwoDigits: "33",
    label: "Home / Airtel",
    relation: "mausa",
  },
  {
    id: "c-mausi-1",
    name: "Mausi Ji",
    phone: "+91 98112 44589",
    normalizedName: "mausi mausi ji aunty mausiji",
    lastTwoDigits: "89",
    label: "Mobile",
    relation: "mausi",
  },

  // Mama / Mami / Uncle / Aunty
  {
    id: "c-mama-1",
    name: "Mama Ji",
    phone: "+91 98355 77814",
    normalizedName: "mama mama ji mamaji uncle",
    lastTwoDigits: "14",
    label: "Mobile",
    relation: "mama",
  },
  {
    id: "c-mami-1",
    name: "Mami Ji",
    phone: "+91 99551 22356",
    normalizedName: "mami mami ji mamiji aunty",
    lastTwoDigits: "56",
    label: "Mobile",
    relation: "mami",
  },

  // Bua / Fufa / Phupha
  {
    id: "c-fufa-1",
    name: "Fufa Ji",
    phone: "+91 98124 99178",
    normalizedName: "fufa fufaji phupha uncle",
    lastTwoDigits: "78",
    label: "Mobile",
    relation: "fufa",
  },
  {
    id: "c-bua-1",
    name: "Bua Ji",
    phone: "+91 97233 44890",
    normalizedName: "bua buaji aunty",
    lastTwoDigits: "90",
    label: "Mobile",
    relation: "bua",
  },

  // Uncle / Aunty generic
  {
    id: "c-uncle-1",
    name: "Uncle (Sharma Ji)",
    phone: "+91 98765 11244",
    normalizedName: "uncle sharma uncle sharmaji",
    lastTwoDigits: "44",
    label: "Home",
    relation: "uncle",
  },
  {
    id: "c-doctor-1",
    name: "Doctor Kumar",
    phone: "+91 98111 00222",
    normalizedName: "doctor dr kumar clinic hospital",
    lastTwoDigits: "22",
    label: "Clinic",
  },
  {
    id: "c-mechanic-1",
    name: "Bike Mechanic Raju",
    phone: "+91 99341 55677",
    normalizedName: "bike mechanic raju garage",
    lastTwoDigits: "77",
    label: "Shop",
  }
];

// Generate dynamic 400+ realistic contacts to ensure a massive 400+ contacts address book
(function generateFullContactBook() {
  const firstNames = [
    "Aakash", "Abhinav", "Aditya", "Ajay", "Alok", "Aman", "Amresh", "Anand", "Anil", "Ankit",
    "Ankur", "Anup", "Anurag", "Arjun", "Arun", "Ashish", "Ashok", "Avinash", "Ayush", "Bablu",
    "Bikram", "Bipin", "Chandan", "Chhotu", "Deepak", "Devendra", "Dhananjay", "Dilip", "Dinesh", "Gaurav",
    "Golu", "Gopal", "Hariom", "Harish", "Hemant", "Himanshu", "Inder", "Jitendra", "Kamlesh", "Karan",
    "Kaushal", "Kishan", "Kishore", "Kunal", "Lakhan", "Lalit", "Madan", "Manish", "Manoj", "Mayank",
    "Mohan", "Monu", "Mukesh", "Naveen", "Neeraj", "Nikhil", "Nilesh", "Nishant", "Nitish", "Omkar",
    "Pankaj", "Pawan", "Piyush", "Prabhat", "Pradeep", "Prakash", "Prashant", "Praveen", "Pramod", "Prince",
    "Priyanshu", "Pushkar", "Radhey", "Rahul", "Rajan", "Rajeev", "Rajendra", "Rajesh", "Rakesh", "Ram",
    "Raman", "Ramesh", "Ravi", "Ravindra", "Rishi", "Ritesh", "Rohan", "Rohit", "Rupesh", "Sachin",
    "Sandip", "Sanjay", "Sanjeev", "Santosh", "Satish", "Satyam", "Saurabh", "Shailesh", "Shantanu", "Shashi",
    "Shivam", "Shubham", "Shyam", "Siddharth", "Sonu", "Subhash", "Sudhir", "Sujeet", "Suman", "Sumit",
    "Sunder", "Sunil", "Suraj", "Surendra", "Suresh", "Tarun", "Tribhuvan", "Uday", "Umesh", "Utkarsh",
    "Vandana", "Varun", "Vicky", "Vijay", "Vikas", "Vikram", "Vimal", "Vinay", "Vinod", "Vipin",
    "Vishal", "Vivek", "Yogesh"
  ];
  const lastNames = ["Kumar", "Singh", "Yadav", "Ahiran", "Sharma", "Verma", "Gupta", "Mishra", "Pandey", "Thakur", "Prasad", "Choudhary", "Paswan", "Ray", "Ranjan"];
  const prefixes = ["98", "99", "97", "96", "94", "93", "91", "88", "87", "85", "82", "80", "79", "78", "77", "76", "75", "74", "73", "72", "70"];

  let count = DEFAULT_CONTACTS.length;
  let index = 0;
  while (count < 420) {
    const fn = firstNames[index % firstNames.length];
    const ln = lastNames[(index + count) % lastNames.length];
    const prefix = prefixes[index % prefixes.length];
    const mid = String(100 + (index * 7) % 900);
    const end = String(1000 + (index * 37 + count) % 9000);
    const phone = `+91 ${prefix}${mid} ${end}`;
    const cleanDigits = phone.replace(/\D/g, "");
    const lastTwo = cleanDigits.slice(-2);

    DEFAULT_CONTACTS.push({
      id: `c-gen-${count + 1}`,
      name: `${fn} ${ln}`,
      phone: phone,
      normalizedName: `${fn.toLowerCase()} ${ln.toLowerCase()} ${fn.toLowerCase()}`,
      lastTwoDigits: lastTwo,
      label: (count % 3 === 0) ? "Jio" : (count % 3 === 1) ? "Airtel" : "Vodafone",
      relation: "other",
    });
    count++;
    index++;
  }
})();

// Helper to extract the last two digits of a phone number
export function extractLastTwoDigits(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly.length >= 2) {
    return digitsOnly.slice(-2);
  }
  return digitsOnly.padStart(2, "0");
}

// Load contacts from LocalStorage or default
export function getStoredContacts(): ContactEntry[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (raw) {
      const parsed: ContactEntry[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load contacts from storage", e);
  }
  // Store default contacts on first run
  saveContacts(DEFAULT_CONTACTS);
  return DEFAULT_CONTACTS;
}

// Save contacts to LocalStorage
export function saveContacts(contacts: ContactEntry[]): void {
  try {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  } catch (e) {
    console.error("Failed to save contacts to storage", e);
  }
}

// Add a new contact
export function addContact(name: string, phone: string, label?: string, relation?: string): ContactEntry {
  const contacts = getStoredContacts();
  const newEntry: ContactEntry = {
    id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(),
    phone: phone.trim(),
    normalizedName: `${name.trim().toLowerCase()} ${relation ? relation.toLowerCase() : ""}`.trim(),
    lastTwoDigits: extractLastTwoDigits(phone),
    label: label || "Mobile",
    relation: relation || "other",
  };
  contacts.push(newEntry);
  saveContacts(contacts);
  return newEntry;
}

// Synonyms / Aliases Dictionary for relationships and common contact names
const RELATIONSHIP_SYNONYMS: Record<string, string[]> = {
  father: ["father", "papa", "dad", "daddy", "pitaji", "bauji", "bapuji", "pita", "abbu", "pop"],
  papa: ["father", "papa", "dad", "daddy", "pitaji", "bauji", "bapuji", "pita", "abbu"],
  dad: ["father", "papa", "dad", "daddy", "pitaji", "bauji", "bapuji", "pita"],
  mother: ["mother", "mummy", "mom", "mataji", "maaji", "maa", "aai", "ammi"],
  mummy: ["mother", "mummy", "mom", "mataji", "maaji", "maa", "aai", "ammi"],
  mom: ["mother", "mummy", "mom", "mataji", "maaji", "maa", "aai"],
  sister: ["sister", "big sister", "badi didi", "didi", "chhoti didi", "behan", "didi ji", "bahin", "sis", "behn"],
  "big sister": ["big sister", "sister", "badi didi", "didi", "didi ji", "behan"],
  didi: ["sister", "big sister", "badi didi", "didi", "chhoti didi", "behan", "didi ji", "bahin"],
  brother: ["brother", "bhai", "bhaiya", "bhaiji", "chhota bhai", "bada bhai", "bro"],
  bhai: ["brother", "bhai", "bhaiya", "bhaiji", "chhota bhai", "bada bhai", "bro"],
  bhaiya: ["brother", "bhai", "bhaiya", "bhaiji", "chhota bhai", "bada bhai"],
  chacha: ["chacha", "chachaji", "kaka", "kakaji", "uncle"],
  kaka: ["chacha", "chachaji", "kaka", "kakaji", "uncle"],
  chachi: ["chachi", "chachiji", "kaki", "kakiji", "aunty"],
  mausa: ["mausa", "mausaji", "mousa", "mousaji", "uncle"],
  mausi: ["mausi", "mausiji", "mousi", "mousiji", "aunty"],
  mama: ["mama", "mamaji", "uncle"],
  mami: ["mami", "mamiji", "aunty"],
  bua: ["bua", "buaji", "fua", "fuaji", "aunty", "phuphi"],
  fufa: ["fufa", "fufaji", "phupha", "phuphaji", "uncle"],
  uncle: ["uncle", "chacha", "kaka", "mausa", "mama", "fufa", "sharma uncle"],
  aunty: ["aunty", "auntie", "chachi", "kaki", "mausi", "mami", "bua"],
  sonu: ["sonu", "sonu kumar"],
  rohan: ["rohan", "rohan singh"],
  amit: ["amit", "amit sharma"],
  rahul: ["rahul", "rahul verma"],
};

// Clean search query to extract core name
export function cleanContactQuery(queryName: string): string {
  return queryName
    .toLowerCase()
    .replace(/^(please|kripya|can you|could you|would you|ask|tell)\s+/i, "")
    .replace(/^(my|our|hamar|humare|mere|apne|unke)\s+/i, "")
    .replace(/\s+(to\s+make\s+a\s+call|to\s+call|make\s+a\s+call|call\s+karo|phone\s+lagao|par\s+call|pe\s+call|ko\s+call)$/i, "")
    .replace(/(whose\s+number\s+ends\s+in|ending\s+in|last\s+digit|last\s+digits|number\s+ends\s+with)\s*\d+/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Search contacts by query name with relationship synonyms and fuzzy token matching
export function searchContacts(queryName: string): ContactEntry[] {
  const clean = cleanContactQuery(queryName);
  if (!clean) return [];

  const contacts = getStoredContacts();
  const queryTokens = clean.split(/\s+/).filter((t) => t.length > 0);

  // 1. Check if query maps to relationship aliases
  let searchAliases = [clean];
  for (const [key, aliases] of Object.entries(RELATIONSHIP_SYNONYMS)) {
    if (queryTokens.includes(key) || aliases.some((a) => clean.includes(a) || a.includes(clean))) {
      searchAliases = Array.from(new Set([...searchAliases, ...aliases]));
    }
  }

  // 2. Direct exact matches across aliases
  const exactMatches = contacts.filter((c) => {
    const contactNorm = c.normalizedName;
    return searchAliases.some((alias) => {
      return (
        contactNorm.includes(alias) ||
        alias.includes(contactNorm) ||
        (c.relation && alias === c.relation) ||
        c.name.toLowerCase().includes(alias)
      );
    });
  });

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // 3. Substring & Token matches
  const tokenMatches = contacts.filter((c) => {
    const contactTokens = c.normalizedName.split(/\s+/);
    return queryTokens.some((q) =>
      q.length >= 3 && contactTokens.some((ct) => ct.includes(q) || q.includes(ct))
    );
  });

  return tokenMatches;
}

// Hindi / Bhojpuri number words to numeric string mapping
const HINDI_NUMBER_WORDS: Record<string, string> = {
  "zero": "0", "shunya": "0", "shunyo": "0", "sunna": "0",
  "one": "1", "ek": "1", "yak": "1", "ak": "1",
  "two": "2", "do": "2", "du": "2", "dono": "2",
  "three": "3", "teen": "3", "tin": "3",
  "four": "4", "char": "4", "chaar": "4",
  "five": "5", "paanch": "5", "panch": "5", "pancha": "5",
  "six": "6", "chhah": "6", "chhe": "6", "chha": "6", "che": "6",
  "seven": "7", "saat": "7", "sat": "7",
  "eight": "8", "aath": "8", "ath": "8",
  "nine": "9", "nau": "9", "no": "9",
  "ten": "10", "das": "10", "dus": "10",
  "eleven": "11", "gyarah": "11", "egarah": "11",
  "twelve": "12", "barah": "12",
  "thirteen": "13", "terah": "13",
  "fourteen": "14", "chaudah": "14", "chauda": "14",
  "fifteen": "15", "pandrah": "15",
  "sixteen": "16", "solah": "16", "sola": "16",
  "seventeen": "17", "satrah": "17", "satra": "17",
  "eighteen": "18", "atharah": "18", "athara": "18",
  "nineteen": "19", "unnis": "19", "unnees": "19", "unees": "19",
  "twenty": "20", "bees": "20", "bis": "20",
  "twenty-one": "21", "ikkis": "21",
  "twenty-two": "22", "bais": "22",
  "twenty-three": "23", "teis": "23", "teees": "23",
  "twenty-four": "24", "chaubis": "24",
  "twenty-five": "25", "pachhis": "25", "pachis": "25",
  "twenty-six": "26", "chhabis": "26",
  "twenty-seven": "27", "sattais": "27",
  "twenty-eight": "28", "atthais": "28",
  "twenty-nine": "29", "untis": "29", "untees": "29",
  "thirty": "30", "tees": "30", "tis": "30",
  "thirty-one": "31", "ikattis": "31",
  "thirty-two": "32", "battis": "32",
  "thirty-three": "33", "tentis": "33",
  "thirty-four": "34", "chauntis": "34",
  "thirty-five": "35", "paintis": "35",
  "thirty-six": "36", "chhattis": "36",
  "thirty-seven": "37", "saintis": "37",
  "thirty-eight": "38", "adhtis": "38", "artis": "38",
  "thirty-nine": "39", "unchalis": "39",
  "forty": "40", "chalis": "40",
  "forty-one": "41", "iktalis": "41",
  "forty-two": "42", "bayalis": "42",
  "forty-three": "43", "tetalis": "43",
  "forty-four": "44", "chaualis": "44", "chawalis": "44",
  "forty-five": "45", "paintalis": "45", "पैंतालीस": "45",
  "forty-six": "46", "chhiyalis": "46",
  "forty-seven": "47", "saintalis": "47",
  "forty-eight": "48", "adtalis": "48", "artalis": "48", "adh-talis": "48", "अड़तालीस": "48",
  "forty-nine": "49", "unchas": "49",
  "fifty": "50", "pachas": "50",
  "fifty-one": "51", "ikyawan": "51", "ikyaawan": "51",
  "fifty-two": "52", "bawan": "52", "baawan": "52", "baavan": "52", "बावन": "52", "बावान": "52",
  "fifty-three": "53", "tirpan": "53",
  "fifty-four": "54", "chauwan": "54", "chawwan": "54",
  "fifty-five": "55", "pachpan": "55",
  "fifty-six": "56", "chhappan": "56",
  "fifty-seven": "57", "sattawan": "57",
  "fifty-eight": "58", "atthawan": "58",
  "fifty-nine": "59", "unsath": "59",
  "sixty": "60", "saath": "60", "sath": "60", "साठ": "60",
  "sixty-one": "61", "iksath": "61",
  "sixty-two": "62", "basath": "62",
  "sixty-three": "63", "tirsath": "63",
  "sixty-four": "64", "chaunsath": "64",
  "sixty-five": "65", "painsath": "65",
  "sixty-six": "66", "chhiyasath": "66",
  "sixty-seven": "67", "sarsath": "67",
  "sixty-eight": "68", "arsath": "68",
  "sixty-nine": "69", "unhattar": "69",
  "seventy": "70", "sattar": "70",
  "seventy-one": "71", "ikhattar": "71",
  "seventy-two": "72", "bahattar": "72",
  "seventy-three": "73", "tihattar": "73",
  "seventy-four": "74", "chauhattar": "74",
  "seventy-five": "75", "pachhattar": "75", "pachatar": "75", "pachtar": "75", "पचहत्तर": "75", "पछत्तर": "75",
  "seventy-six": "76", "chhihattar": "76",
  "seventy-seven": "77", "sathattar": "77",
  "seventy-eight": "78", "athhattar": "78", "athatar": "78", "अठहत्तर": "78",
  "seventy-nine": "79", "unasi": "79",
  "eighty": "80", "assi": "80",
  "eighty-one": "81", "ikyasi": "81",
  "eighty-two": "82", "bayasi": "82",
  "eighty-three": "83", "tirasi": "83",
  "eighty-four": "84", "chaurasi": "84",
  "eighty-five": "85", "pachasi": "85",
  "eighty-six": "86", "chhiyasi": "86",
  "eighty-seven": "87", "sattasi": "87",
  "eighty-eight": "88", "atthasi": "88", "athasi": "88", "अट्ठासी": "88",
  "eighty-nine": "89", "nawasi": "89",
  "ninety": "90", "nabbe": "90", "नब्बे": "90",
  "ninety-one": "91", "ikyanwe": "91",
  "ninety-two": "92", "bayanwe": "92", "banwe": "92", "बानवे": "92", "बान्वे": "92",
  "ninety-three": "93", "tiranwe": "93",
  "ninety-four": "94", "chauranwe": "94",
  "ninety-five": "95", "pachanwe": "95",
  "ninety-six": "96", "chhiyanwe": "96",
  "ninety-seven": "97", "sattanwe": "97",
  "ninety-eight": "98", "anthanwe": "98",
  "ninety-nine": "99", "ninyanwe": "99",
};

// Parse spoken/written input to extract 2-digit number (e.g. "baawan" -> "52", "pachhattar" -> "75", "45" -> "45")
export function parseLastTwoDigits(text: string): string | null {
  const clean = text.toLowerCase().trim();

  // 1. Direct 2-digit number anywhere in string (e.g., "75", "number 75", "last 75", "ends in 75")
  const digitMatch = clean.match(/(?:last|ending|ends|number|digit)?\s*(\d{2})\b/);
  if (digitMatch) {
    return digitMatch[1];
  }

  // 2. Individual digits mentioned (e.g. "seven five" or "saat paanch")
  const words = clean.split(/[\s,.-]+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    const d1 = HINDI_NUMBER_WORDS[w1];
    const d2 = HINDI_NUMBER_WORDS[w2];
    if (d1 && d2 && d1.length === 1 && d2.length === 1) {
      return d1 + d2;
    }
  }

  // 3. Spoken compound number words (e.g. "pachhattar", "bawan", "adtalis", "atthasi", "unnis", "seventy five")
  for (const word of words) {
    if (HINDI_NUMBER_WORDS[word]) {
      const mapped = HINDI_NUMBER_WORDS[word];
      if (mapped.length === 2) {
        return mapped;
      }
    }
  }

  // 4. Fallback search across string for known key words
  for (const [key, val] of Object.entries(HINDI_NUMBER_WORDS)) {
    if (val.length === 2 && clean.includes(key)) {
      return val;
    }
  }

  return null;
}

// Global in-memory pending duplicate call state
let activePendingCall: PendingDuplicateCall | null = null;

export function setPendingCallState(state: PendingDuplicateCall | null): void {
  activePendingCall = state;
  if (state && overlayListener) {
    overlayListener({
      isOpen: true,
      status: "multiple_matches",
      query: state.contactName,
      multipleMatches: state.matches,
      message: `Found ${state.matches.length} numbers for ${state.contactName}. Select by last 2 digits.`,
    });
  }
}

export function getPendingCallState(): PendingDuplicateCall | null {
  if (!activePendingCall) return null;
  // Expire after 3 minutes
  if (Date.now() - activePendingCall.timestamp > 180000) {
    activePendingCall = null;
    return null;
  }
  return activePendingCall;
}

export function clearPendingCallState(): void {
  activePendingCall = null;
}

// Global Overlay Event Listener for UI real-time rendering
type OverlayCallback = (state: CallOverlayState) => void;
let overlayListener: OverlayCallback | null = null;

export function registerCallOverlayListener(callback: OverlayCallback): () => void {
  overlayListener = callback;
  return () => {
    overlayListener = null;
  };
}

export function notifyCallOverlay(state: CallOverlayState): void {
  if (overlayListener) {
    overlayListener(state);
  }
}

// Trigger native phone dialer / tel URI with top-window and anchor interception
export function placeNativePhoneCall(phoneNumber: string, contactName?: string): boolean {
  try {
    const cleanNumber = phoneNumber.replace(/[^\d\+]/g, "");
    if (!cleanNumber) return false;

    const telUri = `tel:${cleanNumber}`;
    console.log(`[ContactService] Placing native phone call to: ${telUri} (${contactName || "Contact"})`);
    
    // Notify overlay that call is active
    notifyCallOverlay({
      isOpen: true,
      status: "calling",
      query: contactName || phoneNumber,
      phoneNumber: cleanNumber,
      message: `Calling ${contactName || cleanNumber}...`,
    });

    // 1. Create an anchor with target="_top" and simulate click
    const a = document.createElement("a");
    a.href = telUri;
    a.target = "_top";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
    }, 1000);

    // 2. Direct top/window location assignment
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = telUri;
      } else {
        window.location.href = telUri;
      }
    } catch (e) {
      try {
        window.location.href = telUri;
      } catch (_) {}
    }

    return true;
  } catch (e) {
    console.error("Error triggering phone call:", e);
    return false;
  }
}

// ----------------------------------------------------
// BIRTHDAY REMINDERS & QUERY FUNCTIONS
// ----------------------------------------------------

export function getTodaysBirthdays(): ContactEntry[] {
  const contacts = getStoredContacts();
  const today = new Date();
  const currentMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return contacts.filter((c) => {
    if (!c.birthday) return false;
    const cleanBday = c.birthday.length > 5 ? c.birthday.slice(5) : c.birthday;
    return cleanBday === currentMMDD;
  });
}

export function getThisWeeksBirthdays(): { contact: ContactEntry; daysLeft: number; dateStr: string }[] {
  const contacts = getStoredContacts();
  const today = new Date();
  const results: { contact: ContactEntry; daysLeft: number; dateStr: string }[] = [];

  contacts.forEach((c) => {
    if (!c.birthday) return;
    const cleanBday = c.birthday.length > 5 ? c.birthday.slice(5) : c.birthday;
    const [bMonth, bDay] = cleanBday.split("-").map(Number);
    if (!bMonth || !bDay) return;

    const bDateThisYear = new Date(today.getFullYear(), bMonth - 1, bDay);
    let diffDays = Math.ceil((bDateThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      // Check next year's birthday if it passed recently
      const bDateNextYear = new Date(today.getFullYear() + 1, bMonth - 1, bDay);
      diffDays = Math.ceil((bDateNextYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (diffDays >= 0 && diffDays <= 7) {
      results.push({
        contact: c,
        daysLeft: diffDays,
        dateStr: `${bDay}/${bMonth}`,
      });
    }
  });

  return results.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function handleBirthdayQuery(input: string): { isBirthdayQuery: boolean; response: string } {
  const lower = input.toLowerCase().trim();
  const isBday =
    /birthday|janamdin|kiska\s+birthday|aaj\s+kiska\s+janamdin|birthday\s+hai/i.test(lower);

  if (!isBday) return { isBirthdayQuery: false, response: "" };

  const todays = getTodaysBirthdays();
  if (todays.length > 0) {
    const names = todays.map((c) => `${c.name} (${c.phone})`).join(", ");
    return {
      isBirthdayQuery: true,
      response: `🎉 अरे वाह राजा जी! आज **${names}** के जन्मदिन बा! फोन क के या व्हाट्सएप्प पर तुरंत बधाई (Wish) दे दीं!`,
    };
  }

  const thisWeek = getThisWeeksBirthdays();
  if (thisWeek.length > 0) {
    const list = thisWeek
      .map((item) => `${item.contact.name} (${item.daysLeft === 0 ? "आज" : `${item.daysLeft} दिन बाद`})`)
      .join(", ");
    return {
      isBirthdayQuery: true,
      response: `ई हफ्ता एह लोगन के जन्मदिन आवे वाला बा:\n${list}`,
    };
  }

  return {
    isBirthdayQuery: true,
    response: "आजु भा ई हफ्ता राउर सेव कइल कॉन्टैक्ट्स में कवनो जन्मदिन दर्ज नइखे!",
  };
}

