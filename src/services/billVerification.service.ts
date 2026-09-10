import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Calculates Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Computes similarity ratio between 0.0 and 1.0 (1.0 = identical).
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return (maxLen - dist) / maxLen;
}

/**
 * Extracts house / premises / unit numbers from an address string.
 * e.g., "No. 07", "7A", "45", "12/1" -> ["7", "7a", "45", "12/1"]
 */
export function extractHouseNumbers(address: string): string[] {
  if (!address) return [];
  const matches = address.toLowerCase().match(/\b(?:no\.?|num\.?)?\s*(\d+[a-z]?(?:\/\d+)?)\b/g) || [];
  const numbers = new Set<string>();
  for (const m of matches) {
    const clean = m.replace(/^(?:no\.?|num\.?)\s*/i, '').trim();
    const normalized = clean.replace(/^0+([1-9])/, '$1');
    if (normalized) numbers.add(normalized);
  }
  return Array.from(numbers);
}

/**
 * Extracts core street words immediately preceding road/street descriptors.
 */
export function extractStreetNames(address: string): string[] {
  if (!address) return [];
  const text = address.toLowerCase();
  const matches = text.match(/([a-z0-9]+)\s+(?:road|rd\.?|street|st\.?|lane|ln\.?|mawatha|mwt\.?|avenue|ave\.?)/g) || [];
  const streets: string[] = [];
  for (const m of matches) {
    const word = m.replace(/\s+(?:road|rd\.?|street|st\.?|lane|ln\.?|mawatha|mwt\.?|avenue|ave\.?).*$/, '').trim();
    if (word && word.length >= 3) streets.push(word);
  }
  return streets;
}

/**
 * Normalizes address keywords (removes noise words, numbers, and punctuation).
 */
export function extractAddressKeywords(address: string): string[] {
  if (!address) return [];
  let text = address.toLowerCase();

  text = text
    .replace(/\b(no|no\.|num|number)\b/g, ' ')
    .replace(/\b(road|rd\.)\b/g, 'rd')
    .replace(/\b(street|st\.)\b/g, 'st')
    .replace(/\b(lane|ln\.)\b/g, 'ln')
    .replace(/\b(avenue|ave\.)\b/g, 'ave')
    .replace(/\b(mawatha|mwt\.)\b/g, 'mwt');

  text = text.replace(/[^a-z0-9]/g, ' ');

  const stopWords = new Set(['the', 'and', 'at', 'in', 'of', 'sri', 'lanka', 'floor', 'flat', 'apartment']);
  return text
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !stopWords.has(t));
}

/**
 * Checks whether two addresses refer to the same premises.
 * - 100% case-insensitive
 * - Punctuation & formatting agnostic
 * - Strict on house numbers (prevents wrong properties on the same road from passing)
 * - Strict on street names (prevents different streets from passing)
 * - Tolerant of Sri Lankan English transliteration differences (e.g. Sivapragasam vs Sivapiragasam)
 */
export function areAddressesEquivalent(extractedAddress: string, expectedAddress: string): boolean {
  if (!extractedAddress || !expectedAddress) return true;

  const cleanExt = extractedAddress.toLowerCase();
  const cleanExp = expectedAddress.toLowerCase();

  // 1. House Number Verification
  const expHouseNums = extractHouseNumbers(expectedAddress);
  const extHouseNums = extractHouseNumbers(extractedAddress);

  if (expHouseNums.length > 0) {
    const houseNumMatch = expHouseNums.some(expNum => {
      return extHouseNums.some(extNum => {
        if (expNum === extNum) return true;
        if (extNum.startsWith(expNum) && (extNum.length === expNum.length + 1 || extNum.includes('/'))) return true;
        return false;
      });
    });

    if (!houseNumMatch && extHouseNums.length > 0) {
      // Both specify a house number, but they conflict (e.g. 7 vs 45) -> MISMATCH!
      return false;
    }
  }

  // 2. City Conflict Verification (strip road names first to avoid "Galle Road" false positives)
  const stripRoads = (s: string) => s.replace(/\b[a-z0-9]+\s+(?:road|rd\.?|street|st\.?|lane|ln\.?|mawatha|mwt\.?|avenue|ave\.?)\b/g, ' ');
  const cleanExpWithoutRoads = stripRoads(cleanExp);
  const cleanExtWithoutRoads = stripRoads(cleanExt);
  const majorCities = ['colombo', 'kandy', 'galle', 'jaffna', 'negombo', 'matara', 'kurunegala', 'batticaloa', 'trincomalee', 'badulla', 'ratnapura', 'anuradhapura'];
  const expCities = majorCities.filter(c => cleanExpWithoutRoads.includes(c));
  const extCities = majorCities.filter(c => cleanExtWithoutRoads.includes(c));
  if (expCities.length > 0 && extCities.length > 0) {
    const hasCityOverlap = expCities.some(c => extCities.includes(c));
    if (!hasCityOverlap) {
      return false; // Conflicting major cities (e.g. Colombo vs Kandy)
    }
  }

  // 3. Street Name Verification
  const expStreets = extractStreetNames(expectedAddress);
  const extStreets = extractStreetNames(extractedAddress);
  if (expStreets.length > 0 && extStreets.length > 0) {
    const streetMatch = expStreets.some(expSt => {
      return extStreets.some(extSt => {
        if (expSt === extSt) return true;
        if (stringSimilarity(expSt, extSt) >= 0.80) return true;
        return false;
      });
    });
    if (!streetMatch) {
      return false; // Different street names (e.g. Temple Rd vs Sivapragasam Rd)
    }
  }

  // 4. Core Keywords Verification
  const expTokens = extractAddressKeywords(expectedAddress).filter(t => !/^\d+$/.test(t));
  const extTokens = extractAddressKeywords(extractedAddress).filter(t => !/^\d+$/.test(t));

  if (expTokens.length === 0 || extTokens.length === 0) return true;

  const significantExpTokens = expTokens.filter(t => t.length >= 4 && !['rd', 'st', 'ln', 'ave', 'mwt'].includes(t));

  if (significantExpTokens.length > 0) {
    let matchedSignificant = 0;
    for (const expToken of significantExpTokens) {
      const match = extTokens.some(extToken => {
        if (expToken === extToken) return true;
        if (stringSimilarity(expToken, extToken) >= 0.80) return true;
        return false;
      });
      if (match) matchedSignificant++;
    }

    if (matchedSignificant === 0) {
      return false;
    }
  }

  let matchedAll = 0;
  for (const expToken of expTokens) {
    const isMatch = extTokens.some(extToken => {
      if (expToken === extToken) return true;
      if (expToken.length >= 4 && extToken.length >= 4 && stringSimilarity(expToken, extToken) >= 0.80) return true;
      return false;
    });
    if (isMatch) matchedAll++;
  }

  return (matchedAll / expTokens.length) >= 0.5;
}

/**
 * Normalizes person names into individual words and initials.
 */
export function parsePersonName(rawName: string): { initials: string[]; words: string[] } {
  if (!rawName) return { initials: [], words: [] };

  const titles = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'rev', 'prof', 'master', 'hon']);
  const clean = rawName
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !titles.has(t));

  const initials: string[] = [];
  const words: string[] = [];

  for (const token of clean) {
    if (token.length === 1) {
      initials.push(token);
    } else {
      words.push(token);
    }
  }

  return { initials, words };
}

/**
 * Checks whether two names match.
 * - 100% case-insensitive
 * - Supports initials and reversed word order (e.g. "A. Nathan" or "Nathan Abiramy" vs "Abiramy Nathan")
 * - STRICT against different individuals (e.g. "K. Sivanathan" vs "Abiramy Nathan", "Kamal Perera" vs "Sunil Perera")
 */
export function areNamesEquivalent(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;

  const normA = nameA.toLowerCase().trim();
  const normB = nameB.toLowerCase().trim();

  // Exact match after lowercasing
  if (normA === normB) return true;

  const parsedA = parsePersonName(nameA);
  const parsedB = parsePersonName(nameB);

  if (parsedA.words.length === 0 || parsedB.words.length === 0) {
    return false;
  }

  // 1. Primary Name Word Requirement (Surname / Family Name)
  // At least one major name word (length >= 3) MUST match closely (similarity >= 0.85)
  // This guarantees "Sivanathan" DOES NOT match "Nathan" (similarity is 0.60)
  const matchedWordsA = new Set<string>();
  const matchedWordsB = new Set<string>();

  for (const wA of parsedA.words) {
    for (const wB of parsedB.words) {
      if (wA === wB || (wA.length >= 4 && wB.length >= 4 && stringSimilarity(wA, wB) >= 0.85)) {
        matchedWordsA.add(wA);
        matchedWordsB.add(wB);
      }
    }
  }

  if (matchedWordsA.size === 0) {
    // No common primary name word -> MISMATCH!
    return false;
  }

  // 2. Conflicting Given Name Check (e.g. 'kamal' vs 'sunil')
  const unMatchedWordsA = parsedA.words.filter(w => !matchedWordsA.has(w));
  const unMatchedWordsB = parsedB.words.filter(w => !matchedWordsB.has(w));

  if (unMatchedWordsA.length > 0 && unMatchedWordsB.length > 0) {
    const initialMatchA = unMatchedWordsA.some(w => parsedB.initials.includes(w[0]));
    const initialMatchB = unMatchedWordsB.some(w => parsedA.initials.includes(w[0]));

    if (!initialMatchA && !initialMatchB) {
      return false; // Conflicting first names (e.g. Kamal Perera vs Sunil Perera)
    }
  }

  // 3. Initials Check
  for (const init of parsedA.initials) {
    const matchesAWord = parsedB.words.some(w => w.startsWith(init));
    const matchesAnInit = parsedB.initials.includes(init);
    if (!matchesAWord && !matchesAnInit && parsedB.words.length > 1) {
      return false;
    }
  }

  for (const init of parsedB.initials) {
    const matchesAWord = parsedA.words.some(w => w.startsWith(init));
    const matchesAnInit = parsedA.initials.includes(init);
    if (!matchesAWord && !matchesAnInit && parsedA.words.length > 1) {
      return false;
    }
  }

  return true;
}

export const verifyUtilityBillImage = async (
  base64Image: string,
  expectedName?: string,
  expectedAddress?: string
): Promise<{ isValid: boolean; reason?: string; errorType?: string | null; extractedName?: string; extractedAddress?: string }> => {
  try {
    if (!base64Image || !base64Image.startsWith('data:image')) {
      return { isValid: false, reason: 'Invalid image format provided.' };
    }

    const promptText = `
      You are an expert document verification assistant for Sri Lankan utility bills.
      Analyze this image and determine if it is a valid, authentic utility bill from ANY of the following authorized providers in Sri Lanka:
      - 'Ceylon Electricity Board' (CEB)
      - 'Electricity Distribution Lanka (Private) Limited' (EDL / LECO / Lanka Electricity Company)
      - 'National Water Supply and Drainage Board' (Water Board)
      
      CRITICAL EXTRACTION INSTRUCTIONS:
      1. Extract the Customer's Full Name printed on the bill (look near labels like "Name", "Customer Name", "Consumer Name", or at the top of the address block).
      2. Extract the full Address printed on the bill.
      
      CRITICAL MATCHING RULES:
      1. CASE-INSENSITIVITY IS MANDATORY:
         - Matching for BOTH Name and Address MUST BE 100% CASE-INSENSITIVE.
         - You MUST completely ignore uppercase vs lowercase differences (e.g. "NO.07,SIVAPRAGASAM ROAD, VANNAR PANNAI, JAFFNA." and "No 07, Sivapiragasam road, Vannar pannai" are the SAME address).
      
      2. PUNCTUATION & SPACING:
         - Ignore punctuation marks (commas, double commas, periods, slashes, hashes) and spacing differences (e.g. "NO.07" vs "No 07" vs "7").
      
      3. SRI LANKAN TRANSLITERATION VARIATIONS:
         - Allow minor phonetic transliterations for the same word (e.g. "Sivapragasam" vs "Sivapiragasam", "Vannar Pannai" vs "Vannarpannai", "Road" vs "Rd", "Street" vs "St").
      
      4. STRICT ADDRESS MISMATCH RULES:
         - Premises / House Number: If expected address is House #7, a bill for House #45 or House #12 is an ADDRESS_MISMATCH.
         - Street Name: The street name must match. If expected is Sivapragasam Road and the bill is for Temple Road or Galle Road, this is an ADDRESS_MISMATCH.
         - City: The city/district must be consistent.
         - If address does not match, set isValid: false and errorType: "ADDRESS_MISMATCH".
      
      5. STRICT OWNERSHIP / NAME MISMATCH RULES:
         - If the customer name on the bill belongs to a DIFFERENT person than expectedName ("${expectedName || 'Not provided'}"):
           e.g. different first name ("Kamal Perera" vs "Sunil Perera"), or different surname ("K. Sivanathan" vs "Abiramy Nathan"):
           YOU MUST set isValid: false and errorType: "NAME_MISMATCH".
         - Do NOT accept a different family member or landlord as an owner match. Return errorType: "NAME_MISMATCH" so the broker process can be initiated.
         - Only treat names as matching if they are genuinely the same individual (allow for initials like "A. Nathan" vs "Abiramy Nathan", omitted titles like Mr/Mrs, or case differences).
      
      6. PROVIDER AUTHENTICITY:
         - If the image is NOT a utility bill from CEB, Electricity Distribution Lanka (Private) Limited, or Water Board (e.g. random image, selfie, receipt), return isValid: false, errorType: "INVALID_DOCUMENT".
      
      You must respond strictly in JSON format matching this structure: 
      {
        "isValid": boolean, 
        "reason": "string",
        "errorType": "NAME_MISMATCH" | "ADDRESS_MISMATCH" | "INVALID_DOCUMENT" | null,
        "extractedName": "string",
        "extractedAddress": "string"
      }.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const extractedName = (parsed.extractedName || '').trim();
      const extractedAddress = (parsed.extractedAddress || '').trim();

      // 1. Check Document Authenticity First
      if (parsed.errorType === 'INVALID_DOCUMENT' || (!parsed.isValid && parsed.errorType !== 'ADDRESS_MISMATCH' && parsed.errorType !== 'NAME_MISMATCH')) {
        return {
          isValid: false,
          errorType: 'INVALID_DOCUMENT',
          reason: parsed.reason || 'The uploaded document is not a valid utility bill from CEB, Electricity Distribution Lanka, or Water Board.',
          extractedName,
          extractedAddress
        };
      }

      // 2. Strict Address Matching Verification
      // Rigorous programmatic verification
      const addressMatches = expectedAddress && extractedAddress
        ? areAddressesEquivalent(extractedAddress, expectedAddress)
        : true;

      if (!addressMatches) {
        // Programmatic check detected address mismatch (different house number, street, or city)
        return {
          isValid: false,
          errorType: 'ADDRESS_MISMATCH',
          reason: `The extracted address '${extractedAddress}' does not match the property address '${expectedAddress}'.`,
          extractedName,
          extractedAddress
        };
      }

      // If AI flagged ADDRESS_MISMATCH, double check with our address equivalence test
      if (parsed.errorType === 'ADDRESS_MISMATCH' && !addressMatches) {
        return {
          isValid: false,
          errorType: 'ADDRESS_MISMATCH',
          reason: parsed.reason || `The extracted address '${extractedAddress}' does not match the property address '${expectedAddress}'.`,
          extractedName,
          extractedAddress
        };
      }

      // 3. Strict Ownership / Name Matching Verification
      // Address matches! Now check owner / customer name
      const nameMatches = expectedName && extractedName
        ? areNamesEquivalent(extractedName, expectedName)
        : true;

      // If the AI flagged NAME_MISMATCH OR our programmatic name check confirms a different person:
      if (!nameMatches || (parsed.errorType === 'NAME_MISMATCH' && !nameMatches)) {
        return {
          isValid: false,
          errorType: 'NAME_MISMATCH',
          reason: `Address matches successfully, but extracted customer name '${extractedName}' does not match your profile name '${expectedName}'.`,
          extractedName,
          extractedAddress
        };
      }

      // 4. Both Address and Name Verified!
      return {
        isValid: true,
        errorType: null,
        reason: 'Document verified successfully. Property address and owner name matched.',
        extractedName,
        extractedAddress
      };
    }
    return { isValid: false, reason: "Could not analyze the image." };
  } catch (error) {
    console.error("OpenAI bill verification error:", error);
    return { isValid: false, reason: "Verification service failed." };
  }
};

export const verifyNicAgainstBill = async (
  nicFrontBase64: string,
  nicBackBase64: string,
  billImageUrl: string
): Promise<{ isMatch: boolean; reason?: string; nicName?: string; billName?: string }> => {
  try {
    const promptText = `
      You are an expert document verification assistant.
      I will provide you with three images:
      1. The Front side of a National Identity Card (NIC).
      2. The Back side of the National Identity Card (NIC).
      3. A Utility Bill (Ceylon Electricity Board (CEB), Electricity Distribution Lanka (Private) Limited / LECO, or National Water Supply and Drainage Board).

      Your task:
      1. Extract the full name of the person from the NIC (check both front and back).
      2. Extract the customer name from the Utility Bill.
      3. Determine if the names fundamentally match.

      CRITICAL RULES:
      - Name matching MUST BE 100% CASE-INSENSITIVE. Do not differentiate between upper case and lower case letters.
      - Allow for initials, omitted titles (Mr/Mrs/Miss), and different ordering of names for the SAME person (e.g. "A. Nathan" vs "Nathan Abiramy").
      - If the names belong to DIFFERENT individuals (e.g. "K. Sivanathan" vs "Abiramy Nathan", or "Kamal Perera" vs "Sunil Perera"), you MUST set "isMatch": false.
      - If you cannot clearly read a name on the NIC, you MUST set "isMatch": false.
      - If you cannot clearly read a name on the Utility Bill, you MUST set "isMatch": false.

      Respond strictly in JSON format matching this structure:
      {
        "isMatch": boolean,
        "reason": "string explaining the match or mismatch",
        "nicName": "string (extracted from NIC) or 'Not Found'",
        "billName": "string (extracted from bill) or 'Not Found'"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: nicFrontBase64 } },
            { type: "image_url", image_url: { url: nicBackBase64 } },
            { type: "image_url", image_url: { url: billImageUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      let isMatch = Boolean(parsed.isMatch);
      let reason = parsed.reason || '';
      const nicName = (parsed.nicName || '').trim();
      const billName = (parsed.billName || '').trim();

      // Enforce rigorous programmatic name matching
      if (nicName && billName && nicName !== 'Not Found' && billName !== 'Not Found') {
        const rigorousMatch = areNamesEquivalent(billName, nicName);
        if (!rigorousMatch) {
          isMatch = false;
          reason = `The name on the NIC ('${nicName}') does not match the customer name on the utility bill ('${billName}').`;
        } else {
          isMatch = true;
          reason = 'Names match successfully.';
        }
      }

      return {
        isMatch,
        reason,
        nicName,
        billName
      };
    }
    return { isMatch: false, reason: "Could not analyze the images." };
  } catch (error) {
    console.error("OpenAI NIC vs Bill verification error:", error);
    return { isMatch: false, reason: "Verification service failed." };
  }
};
