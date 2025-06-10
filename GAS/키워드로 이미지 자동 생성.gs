// ✅ API 키 및 설정
const GEMINI_API_KEY = 'YOUR API KEY';
const STABILITY_API_KEY = 'YOUR API KEY';
const FOLDER_ID = 'YOUR FOLDER ID';

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();

  if (sheet.getName() !== '시트1') return;
  if (range.getColumn() !== 1 || row === 1) return;

  const topic = sheet.getRange(row, 1).getValue();
  const keywordCell = sheet.getRange(row, 2).getValue();
  const imageCell = sheet.getRange(row, 4).getValue();

  if (!topic || keywordCell || imageCell) return;

  const folder = DriveApp.getFolderById(FOLDER_ID);

  try {
    // 1. Gemini로 키워드 생성 → B열
    const keywords = generateKeywordsFromGemini(topic);
    sheet.getRange(row, 2).setValue(keywords.join(", "));

    // 2. C열에 번역 함수 삽입
    sheet.getRange(row, 3).setFormula(`=GOOGLETRANSLATE(A${row}, "ko", "en")`);

    // 3. 영어 번역 결과가 계산될 때까지 대기 (최대 5초)
    SpreadsheetApp.flush();
    Utilities.sleep(1000);

    const translated = sheet.getRange(row, 3).getDisplayValue();

    // 4. Stability로 이미지 생성 → D열
    const imageUrl = generateImageFromStability(translated, keywords);
    sheet.getRange(row, 4).setValue(imageUrl);

  } catch (err) {
    Logger.log("에러 발생: " + err.message);
    sheet.getRange(row, 4).setValue("에러: " + err.message);
  }
}

// ✅ Gemini 2.0 Flash 기반 키워드 생성
function generateKeywordsFromGemini(topic) {
  const prompt = `다음 주제에 대한 핵심 키워드 10개를 쉼표로 구분하여 작성해줘: "${topic}"`;

  const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const result = JSON.parse(response.getContentText());
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const keywords = text.replace(/\n/g, "").split(/,\s*/).map(k => k.trim());

  if (!keywords || keywords.length === 0) throw new Error("Gemini 응답 오류");

  return keywords;
}

// ✅ Stability API 기반 이미지 생성 (응답은 PNG 바이너리)
function generateImageFromStability(translatedTopic, keywords) {
  const prompt = `A high-resolution, ultra-realistic photograph taken with a DSLR camera, 5000x4000 resolution, cinematic lighting. Focus on real textures and accurate depth. Subject: ${translatedTopic}. Elements: ${keywords.join(", ")}. No surrealism.`;

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
    headers: {
      "Authorization": `Bearer ${STABILITY_API_KEY}`
    },
    payload: body,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch("https://api.stability.ai/v2beta/stable-image/generate/core", options);
  const responseCode = response.getResponseCode();
  const contentType = response.getHeaders()["Content-Type"];

  Logger.log("📥 응답 코드: " + responseCode);
  Logger.log("📥 Content-Type: " + contentType);

  if (responseCode !== 200 || !contentType.startsWith("image/")) {
    const errorText = response.getContentText();
    throw new Error(`Stability 이미지 생성 실패: ${errorText}`);
  }

  const imageBlob = response.getBlob().setName(translatedTopic + ".png");
  const file = DriveApp.getFolderById(FOLDER_ID).createFile(imageBlob);
  return file.getUrl();
}
