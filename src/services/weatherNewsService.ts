import { apiWeatherNews } from "./api";

export interface WeatherData {
  temperature: number;
  condition: string;
  isDay: boolean;
  windSpeed: number;
  city: string;
}

/**
 * Fetches real-time weather using browser Geolocation & Open-Meteo API
 */
export async function getLiveWeather(): Promise<string> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      fetchWeatherByCoords(24.88, 85.54, "बिहार (नवादा)").then(resolve);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const result = await fetchWeatherByCoords(latitude, longitude, "राउर इलाका");
        resolve(result);
      },
      async (err) => {
        console.warn("Location permission error for weather:", err);
        // Fallback to Nawada / Bihar coordinates (developer's region)
        const result = await fetchWeatherByCoords(24.88, 85.54, "बिहार");
        resolve(result);
      },
      { timeout: 5000 }
    );
  });
}

async function fetchWeatherByCoords(lat: number, lon: number, locationName: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
    );
    if (!res.ok) throw new Error("Weather API failed");
    const data = await res.json();
    const cur = data.current_weather;

    const temp = Math.round(cur.temperature);
    const wind = Math.round(cur.windspeed);
    const code = cur.weathercode;

    // Weather code description
    let conditionBhojpuri = "साफ़ आसमान बा";
    let advice = "घूमे-फिरे खातिर बढ़िया मौसम बा!";

    if (code >= 1 && code <= 3) {
      conditionBhojpuri = "हल्का बादल लागल बा";
      advice = "मौसम एकदम सुहावन बा!";
    } else if (code >= 45 && code <= 48) {
      conditionBhojpuri = "कुहासा / कोहरा छाइल बा";
      advice = "सावधानी से गाड़ी चलाईब!";
    } else if (code >= 51 && code <= 67) {
      conditionBhojpuri = "रिमझिम बारिश हो रहल बा";
      advice = "बाहर निकलत बानी त छाता जरूर ले लीब!";
    } else if (code >= 71 && code <= 86) {
      conditionBhojpuri = "तेज बारिश आ झोंकेदार हवा बा";
      advice = "घर में बइठ के गरम-गरम पकौड़ी छानीं!";
    } else if (code >= 95) {
      conditionBhojpuri = "आंधी-तूफान के सम्भावना बा";
      advice = "घरही में रहीं, बाहर मत निकलीं!";
    }

    if (temp > 35) {
      advice += " अउरी धूप तेज बा त पानी खूब पीयत रहीं!";
    } else if (temp < 15) {
      advice += " तनी गरम कपड़ा पहिन के निकलीं!";
    }

    return `मालिक, ${locationName} में अभी तापमान करीब ${temp}°C बा, ${conditionBhojpuri} अउरी हवा ${wind} km/h के रफ्तार से बहत बा। ${advice}`;
  } catch (error) {
    console.error("Weather fetch error:", error);
    return "मालिक, अभी मौसम के लाइव जानकारी निकाले में तनी दिक्कत भइल बा, बाकिर चिंता मत करीं, अपना सेहत के पूरा ध्यान रखीं!";
  }
}

/**
 * Fetches current top news headlines summarized into 2-4 brief, lively Bhojpuri sentences
 */
export async function getLiveNewsBriefing(): Promise<string> {
  try {
    const news = await apiWeatherNews("news");
    return (
      news ||
      "मालिक, आजु के मुख्य खबर बा कि देश-दुनिया में तकनीकी अउरी खेल के खूब चर्चा बा, अउरी हमार बॉस रॉयल अंकित अहिरान के एआई टेक्नोलॉजी के डंका बज रहल बा!"
    );
  } catch (error) {
    console.error("News fetch error:", error);
    return "मालिक, अभी इंटरनेट से ताजा खबर खिंचे में तनी रुकावट बा, बाकिर सबसे बड़ा खबर ई बा कि हम अउरी रउआ एक संगे बानी जा!";
  }
}
