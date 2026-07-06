import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      Analyze this image and determine if it is a valid, authentic utility bill from either the 'Ceylon Electricity Board' (CEB) or the 'National Water Supply and Drainage Board' (Water Board) in Sri Lanka. 
      
      CRITICAL EXTRACTION INSTRUCTIONS:
      1. Extract the exact Customer's Full Name (including initials, titles like Mr/Mrs, or first names) printed on the bill. Look near labels like "Name", "Customer Name", or at the top of the address block.
      2. Extract the full Address printed on the bill.
      
      You must respond strictly in JSON format matching this structure: 
      {
        "isValid": boolean, 
        "reason": "string",
        "errorType": "NAME_MISMATCH" | "ADDRESS_MISMATCH" | "INVALID_DOCUMENT" | null,
        "extractedName": "string",
        "extractedAddress": "string"
      }.
      
      Verification Rules:
      1. If the image is a random photo, screenshot, or not a utility bill from these specific authorities, return isValid: false, errorType: "INVALID_DOCUMENT", and explain why.
      2. If expectedName is provided ("${expectedName || 'Not provided'}"), compare it with the extracted name. They do not need to be character-for-character identical (allow for slight variations, initials, omitted titles, or misspellings), but they must fundamentally represent the same person. If there is a clear mismatch, return isValid: false, errorType: "NAME_MISMATCH", and mention the name mismatch in the reason.
      3. If expectedAddress is provided ("${expectedAddress || 'Not provided'}"), compare it with the extracted address. They do not need to be identical (allow for abbreviations, missing postal codes, etc.), but they must point to the same location. If there is a clear mismatch, return isValid: false, errorType: "ADDRESS_MISMATCH", and mention the address mismatch in the reason.
      Note: If both name and address mismatch, prioritize returning "ADDRESS_MISMATCH" for the errorType.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1, // Added low temperature for more precise, deterministic OCR extraction
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
      return {
        isValid: Boolean(parsed.isValid),
        reason: parsed.reason || '',
        errorType: parsed.errorType || null,
        extractedName: parsed.extractedName || '',
        extractedAddress: parsed.extractedAddress || ''
      };
    }
    return { isValid: false, reason: "Could not analyze the image." };
  } catch (error) {
    console.error("OpenAI bill verification error:", error);
    return { isValid: false, reason: "Verification service failed." };
  }
};
