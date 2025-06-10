// ✅ API 키 및 설정
const GEMINI_API_KEY = '.YOUR API KEY';
const STABILITY_API_KEY = 'YOUR API KEY';
const FOLDER_ID = 'YOUR FORDER ID'; // 폴더 ID

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row = range.getRow();

  if (sheet.getName() !== '시트1') return;
  if (range.getColumn() !== 1 || row === 1) return;

  const korean = sheet.getRange(row, 1).getValue();
  if (!korean) return;

  try {
    // ⏳ 1. 사용자에게 이미지 생성 중이라는 안내 표시
    sheet.getRange(row, 5).setValue("이미지 생성 중...");

    // 🌐 2. 한국어 → 중국어
    const chinese = LanguageApp.translate(korean, 'ko', 'zh-CN');
    sheet.getRange(row, 2).setValue(chinese);

    // 💡 3. Gemini 키워드
    const keywords = generateKeywordsFromGemini(korean);
    sheet.getRange(row, 3).setValue(keywords.join(", "));

    // 🌎 4. 영어 번역
    sheet.getRange(row, 4).setFormula(`=GOOGLETRANSLATE(A${row}, "ko", "en")`);
    SpreadsheetApp.flush();
    Utilities.sleep(1000);

    const translated = sheet.getRange(row, 4).getDisplayValue();

    // 🖼 5. 이미지 생성 → 성공 시 링크 덮어쓰기
    const imageUrl = generateImageFromStability(translated, keywords);
    sheet.getRange(row, 5).setValue(imageUrl);

  } catch (err) {
    sheet.getRange(row, 5).setValue("에러: " + err.message);
    Logger.log("❌ 이미지 생성 오류: " + err.message);
  }
}

// ✅ Gemini 2.0 Flash 기반 키워드 생성
function generateKeywordsFromGemini(text) {
  const prompt = `다음 문장을 설명하는 핵심 키워드 10개를 쉼표로 구분해줘: "${text}"`;

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return textOutput.replace(/\n/g, "").split(/,\s*/).map(k => k.trim());
}

// ✅ Stability API 기반 이미지 생성
function generateImageFromStability(translatedText, keywords) {
  const prompt = `A high-resolution, ultra-realistic photograph, cinematic lighting. Subject: ${translatedText}. Elements: ${keywords.join(", ")}. DSLR style, 5000x4000 resolution.`;

  const boundary = "----WebKitFormBoundary" + new Date().getTime();
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;

  const body = [
    delimiter,
    'Content-Disposition: form-data; name="prompt"\r\n',
    prompt,
    delimiter,
    'Content-Disposition: form-data; name="output_format"\r\n',
    'png',
    closeDelimiter
  ].join('\r\n');

  const options = {
    method: "post",
    contentType: `multipart/form-data; boundary=${boundary}`,
    headers: { "Authorization": `Bearer ${STABILITY_API_KEY}` },
    payload: body,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch("https://api.stability.ai/v2beta/stable-image/generate/core", options);
  const responseCode = response.getResponseCode();
  const contentType = response.getHeaders()["Content-Type"];

  if (responseCode !== 200 || !contentType.startsWith("image/")) {
    throw new Error(`이미지 생성 실패: ${response.getContentText()}`);
  }

  const imageBlob = response.getBlob().setName(translatedText + ".png");
  const file = DriveApp.getFolderById(FOLDER_ID).createFile(imageBlob);
  return file.getUrl();
}
