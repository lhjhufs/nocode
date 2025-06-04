function onEdit(e) {
  const apiKey = 'AIzaSyBYEQeBQ4tfDlMFi5OYna7rGXrVHw2CN5s';
  const sheetName = '시트1'; // 연구자님 시트 이름
  const sheet = e.source.getSheetByName(sheetName);
  const range = e.range;
  
  if (!sheet || sheet.getName() !== sheetName) return;
  if (range.getColumn() !== 1 || range.getRow() === 1) return;
  
  const word = range.getValue();
  if (word) {
    const prompt = `단어 "${word}"를 사용하여 초급 중국어 학습자를 위한 아주 짧은 중국어 문장을 만들어 주세요. 
그리고 그 문장의 병음(pinyin)과 한국어 번역도 함께 작성해 주세요. 
결과는 반드시 [중국어 문장] || [병음] || [한국어 번역] 형태로 구분해서 출력해 주세요.`;

    const result = callGeminiAPI(apiKey, prompt);
    
    if (result) {
      const parts = result.split('||');
      if (parts.length === 3) {
        sheet.getRange(range.getRow(), 2).setValue(parts[0].trim()); // B열: 중국어 문장
        sheet.getRange(range.getRow(), 3).setValue(parts[1].trim()); // C열: 병음
        sheet.getRange(range.getRow(), 4).setValue(parts[2].trim()); // D열: 한국어 번역
      } else {
        sheet.getRange(range.getRow(), 2).setValue('형식 오류');
      }
    }
  }
}

function callGeminiAPI(apiKey, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
  
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  try {
    return json.candidates[0].content.parts[0].text.trim();
  } catch (e) {
    Logger.log("에러: " + e);
    return "문장 생성 실패";
  }
}
