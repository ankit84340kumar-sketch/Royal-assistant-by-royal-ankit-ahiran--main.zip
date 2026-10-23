// studyBuddyService.ts - Coding & Study Buddy Mode for Zoya AI
import { addStudyLog, getTodayStudyMinutes, loadUserStudyLogs } from "./userStorageService";

export interface CodingQuiz {
  topic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

const PYTHON_QUIZZES: CodingQuiz[] = [
  {
    topic: "Python Basics",
    question: "पाइथन में लिस्ट (List) बनावे खातिर कवन ब्रैकेट इस्तेमाल होला?",
    options: ["A) ( ) Parentheses", "B) [ ] Square brackets", "C) { } Curly braces", "D) < > Angle brackets"],
    correctAnswer: "B",
    explanation: "पाइथन में [ ] से List बनेला, जइसे: my_list = [1, 2, 3]",
  },
  {
    topic: "Python Functions",
    question: "पाइथन में फ़ंक्शन डिफाइन करे खातिर कवन कीवर्ड उपयोग होला?",
    options: ["A) function", "B) func", "C) def", "D) lambda"],
    correctAnswer: "C",
    explanation: "पाइथन में 'def' कीवर्ड से फंक्शन बनावल जाला, जइसे: def my_function():",
  },
  {
    topic: "Python Strings",
    question: "पाइथन में स्ट्रिंग के लंबाई (Length) नापे खातिर कवन फंक्शन बा?",
    options: ["A) length()", "B) count()", "C) size()", "D) len()"],
    correctAnswer: "D",
    explanation: "len() फंक्शन से स्ट्रिंग या लिस्ट के कुल लंबाई पता चलेला!",
  },
  {
    topic: "Cybersecurity Basics",
    question: "नेटवर्क स्कैनिंग अउरी ओपन पोर्ट खोजे खातिर सबसे मशहूर टूल कवन बा?",
    options: ["A) Nmap", "B) Notepad", "C) VLC", "D) Chrome"],
    correctAnswer: "A",
    explanation: "Nmap से नेटवर्क मैपिंग, पोर्ट स्कैनिंग अउरी सिक्योरिटी ऑडिटिंग होला! हमार बॉस रॉयल अंकित अहिरान एकर मास्टर बाड़न!",
  },
];

export function getRandomQuiz(topic = "Python"): CodingQuiz {
  const filtered = PYTHON_QUIZZES.filter((q) => q.topic.toLowerCase().includes(topic.toLowerCase()));
  const pool = filtered.length > 0 ? filtered : PYTHON_QUIZZES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Handles study time logging and queries
 */
export function handleStudyBuddyCommand(userId: string, input: string): { isStudyCommand: boolean; response: string } {
  const lower = input.toLowerCase().trim();

  // 1. Study query: "Aaj kitni der padhai ki", "kitna padhe"
  if (/kitni\s*der\s*padhai|kitna\s*padhai|study\s*time|aaj\s*kitna\s*padhe/i.test(lower)) {
    const todayMins = getTodayStudyMinutes(userId);
    const hrs = Math.floor(todayMins / 60);
    const mins = todayMins % 60;
    const timeFormatted = hrs > 0 ? `${hrs} घंटा ${mins} मिनट` : `${mins} मिनट`;

    if (todayMins === 0) {
      return {
        isStudyCommand: true,
        response:
          "मालिक, आजु के स्टडी लॉग में अभी कवनो समय दर्ज नइखे। जब पढ़ाई पूरा होखे त बोलीं 'मैंने 1 घंटा पढ़ाई की', हम तुरंत नोट क लेब!",
      };
    }

    return {
      isStudyCommand: true,
      response: `शाबाश राजा जी! आज रउआ कुल **${timeFormatted}** पढ़ाई कइले बानी! हमार डेवलपर रॉयल अंकित अहिरान के जइसन मेहनत करत रहीं, भविष्य बहुत उज्ज्वल बा!`,
    };
  }

  // 2. Study logging: "Maine abhi 1 ghanta padhai ki", "2 hours study kiya", "45 minute padha"
  const hrMatch = lower.match(/(\d+)\s*(?:ghanta|ghante|hour|hours|hr|hrs)\s*(?:padhai|study|padha)/i) ||
                 lower.match(/(?:padhai|study|padha)\s*(\d+)\s*(?:ghanta|ghante|hour|hours|hr|hrs)/i);
  const minMatch = lower.match(/(\d+)\s*(?:minute|min|m)\s*(?:padhai|study|padha)/i);

  if (hrMatch || minMatch) {
    let totalMins = 0;
    if (hrMatch && hrMatch[1]) totalMins += parseInt(hrMatch[1], 10) * 60;
    if (minMatch && minMatch[1]) totalMins += parseInt(minMatch[1], 10);
    if (totalMins === 0) totalMins = 60;

    addStudyLog(userId, totalMins, "Coding & Studies");
    const todayTotal = getTodayStudyMinutes(userId);
    const hrsTotal = Math.floor(todayTotal / 60);
    const minsTotal = todayTotal % 60;

    return {
      isStudyCommand: true,
      response: `गजब! रउआ ${totalMins} मिनट के स्टडी सेशन सफलता से लॉग क देलीं! आजु के कुल पढ़ाई भइल: ${hrsTotal > 0 ? `${hrsTotal} घंटा ` : ""}${minsTotal} मिनट! अइसने लगातार पढ़ते रहीं!`,
    };
  }

  // 3. Quiz command: "Python ka quiz lo", "sawal pucho"
  if (/quiz|sawal\s+pucho|question\s+pucho|test\s+lo/i.test(lower)) {
    const quiz = getRandomQuiz();
    const optionsText = quiz.options.join("\n");
    return {
      isStudyCommand: true,
      response: `हाँ मालिक! ई सवाल राउर खातिर:\n\n**${quiz.question}**\n${optionsText}\n\nबोलिए सही उत्तर कवन बा (A, B, C भा D)?`,
    };
  }

  return { isStudyCommand: false, response: "" };
}
