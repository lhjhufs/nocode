// === 1. 민감 정보 저장 (최초 1회 실행) ===
function setBloggerAuthKeys() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("CLIENT_ID", "YOUR CLIENT_ID");
  props.setProperty("CLIENT_SECRET", "YOUR CLIENT_SECRET");
  props.setProperty("REFRESH_TOKEN", "YOUR REFRESH_TOKEN");
  props.setProperty("BLOG_ID", "YOUR BLOG ID");
}

// === 2. Access Token 자동 갱신 ===
function getAccessTokenFromRefresh() {
  const props = PropertiesService.getScriptProperties();
  const payload = {
    client_id: props.getProperty("CLIENT_ID"),
    client_secret: props.getProperty("CLIENT_SECRET"),
    refresh_token: props.getProperty("REFRESH_TOKEN"),
    grant_type: 'refresh_token'
  };
  const options = {
    method: 'post',
    payload: payload
  };
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', options);
  const json = JSON.parse(response.getContentText());
  return json.access_token;
}

// === 3. Blogger 자동 게시 + URL 기록 ===
function postToBloggerAuto(title, content, row) {
  const props = PropertiesService.getScriptProperties();
  const blogId = props.getProperty("BLOG_ID");
  const accessToken = getAccessTokenFromRefresh();

  const post = { title, content };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    payload: JSON.stringify(post),
    muteHttpExceptions: true
  };

  const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`;
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  const postUrl = json.url;

  if (postUrl && row) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('시트1');
    sheet.getRange(row, 5).setValue(postUrl); // ✅ E열에 URL 기록
  }

  Logger.log(postUrl);
}

// === 4. Gemini API 호출 함수 ===
function callGeminiAPI(prompt) {
  const apiKey = 'YOUR API KEY';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// === 5. 키워드 추출 ===
function extractKeywords(text) {
  const prompt = `아래 글의 주요 키워드를 10개 뽑아주세요.\n- 중복 없이\n- 너무 일반적인 단어(예: 역사, 사람 등) 말고 주제와 연관된 단어\n- 쉼표로 구분된 한 줄로 출력해 주세요.\n\n글:\n${text}`;
  const keywords = callGeminiAPI(prompt);
  return keywords ? keywords.trim() : "❌ 키워드 생성 실패";
}

// === 6. 코드블럭 제거 ===
function cleanGeminiHtml(text) {
  if (text.startsWith("```html") || text.startsWith("```")) {
    return text.replace(/```html|```/g, "").trim();
  }
  return text;
}

// === 7. Unsplash 이미지 검색 ===
function searchUnsplashImage(keyword) {
  const accessKey = 'YOUR API KEY';
  const query = `china ${keyword}`;
  const previewUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${accessKey}`;
  const previewResponse = UrlFetchApp.fetch(previewUrl);
  const previewData = JSON.parse(previewResponse.getContentText());
  const totalPages = Math.min(previewData.total_pages || 1, 10);
  const randomPage = Math.floor(Math.random() * totalPages) + 1;
  const finalUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&page=${randomPage}&orientation=landscape&client_id=${accessKey}`;
  const finalResponse = UrlFetchApp.fetch(finalUrl);
  const finalData = JSON.parse(finalResponse.getContentText());
  if (finalData.results && finalData.results.length > 0) {
    return finalData.results[0].urls.regular;
  } else {
    return null;
  }
}

// === 8. 이미지 삽입 함수 ===
function addImageToHTML(htmlContent, imageUrl) {
  if (!imageUrl) return htmlContent;
  const imgTag = `<p><img src="${imageUrl}" alt="관련 이미지" style="max-width:100%; height:auto;"></p>`;
  return imgTag + htmlContent;
}

// === 9. 단순화된 TTS 함수 (최대 안정성) ===
function addTTSToHTML(htmlContent, title) {
  const apiKey = "YOUR API KEY";
  const folderId = "1xqgSJOXGPm7j6XxOwV4CzUmJdB5S7iVi";

  if (!htmlContent || typeof htmlContent !== 'string') {
    console.error("유효한 HTML 콘텐츠가 없음");
    return htmlContent;
  }

  try {
    // 로그 추가
    console.log("TTS 함수 시작");
    
    // 1. 가장 기본적인 텍스트 추출
    const plainText = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 2. 제목 추가 (있는 경우에만)
    let finalText = plainText;
    if (title && typeof title === 'string' && title.trim()) {
      finalText = title.trim() + ". " + plainText;
    }
    
    // 3. 텍스트 길이 제한 (1000자로 안전하게 제한)
    const MAX_CHARS = 1000;
    if (finalText.length > MAX_CHARS) {
      finalText = finalText.substring(0, MAX_CHARS);
      console.log(`텍스트 길이 ${finalText.length}자로 제한`);
    }
    
    // 디버깅: 텍스트 일부 로그
    console.log("처리할 텍스트(일부):", finalText.substring(0, 100));
    
    // 4. 가장 기본적인 API 요청 (최소 설정)
    const ttsPayload = {
      input: { text: finalText },
      voice: { languageCode: "ko-KR" },
      audioConfig: { audioEncoding: "MP3" }
    };

    // 5. API 요청 설정
    const ttsOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(ttsPayload),
      muteHttpExceptions: true
    };

    // 6. API 호출 및 로깅
    console.log("TTS API 호출 시작");
    const response = UrlFetchApp.fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      ttsOptions
    );
    
    // 7. 응답 코드 확인 및 로깅
    const responseCode = response.getResponseCode();
    console.log("TTS API 응답 코드:", responseCode);
    
    if (responseCode !== 200) {
      const responseText = response.getContentText();
      console.error("TTS API 오류:", responseText);
      return htmlContent;
    }
    
    // 8. 응답 파싱 및 로깅
    let responseData;
    try {
      responseData = JSON.parse(response.getContentText());
      console.log("응답 파싱 성공");
    } catch (parseError) {
      console.error("응답 파싱 오류:", parseError);
      return htmlContent;
    }
    
    if (!responseData.audioContent) {
      console.error("오디오 콘텐츠 없음");
      return htmlContent;
    }
    
    console.log("오디오 콘텐츠 있음, 길이:", responseData.audioContent.length);

    // 9. 오디오 파일 생성
    try {
      const timestamp = new Date().getTime();
      const filename = `tts_${timestamp}.mp3`;
      
      const audioContent = responseData.audioContent;
      const blob = Utilities.base64Decode(audioContent);
      const mp3File = Utilities.newBlob(blob, "audio/mpeg", filename);
      
      console.log("Blob 생성 성공");
      
      // 10. 파일 저장
      const driveFile = DriveApp.getFolderById(folderId).createFile(mp3File);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const fileId = driveFile.getId();
      console.log("파일 저장 성공, ID:", fileId);
      
      // 11. 오디오 플레이어 생성
      const audioHTML = `
        <h3>🎧 본문 듣기</h3>
        <iframe 
          frameborder="0" 
          width="450" 
          height="55" 
          src="https://drive.google.com/file/d/${fileId}/preview">
        </iframe>`;

      return htmlContent + audioHTML;
    } catch (fileError) {
      console.error("파일 처리 오류:", fileError);
      return htmlContent;
    }
  } catch (error) {
    console.error("TTS 전체 처리 오류:", error);
    return htmlContent;
  }
}

// === 10. onEdit 자동 실행 ===
function onEdit(e) {
  const sheet = e.source.getSheetByName('시트1');
  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (col !== 1 || row === 1 || !sheet) return;

  const title = sheet.getRange(row, 1).getValue();
  if (!title) return;

  sheet.getRange(row, 2).setValue("블로그 글 생성 중...");

  const prompt = `"${title}"에 대해 약 2000자 분량의 블로그 글을 작성해 주세요.
서론, 본론, 결론 구조로 구성하고, 단락마다 적절한 소제목(h3), 본문(p) 마크업만 사용해 주세요. '서론', '본문', '결론' 표현은 빼주세요.
전체 HTML 문서 구조는 제외하고, 본문 콘텐츠만 HTML로 작성해 주세요.`;

  const result = callGeminiAPI(prompt);
  const cleanHTML = cleanGeminiHtml(result);

  const imageUrl = searchUnsplashImage(title);
  const htmlWithImage = addImageToHTML(cleanHTML, imageUrl);

  if (htmlWithImage && htmlWithImage.trim().length > 100) {
    const htmlWithAudio = addTTSToHTML(htmlWithImage, title);
    sheet.getRange(row, 2).setValue(htmlWithAudio);
    postToBloggerAuto(title, htmlWithAudio, row);
    sheet.getRange(row, 3).setValue("✅ 자동 게시 완료");

    const keywords = extractKeywords(cleanHTML);
    sheet.getRange(row, 4).setValue(keywords);
  } else {
    sheet.getRange(row, 2).setValue("블로그 글 생성 실패");
    sheet.getRange(row, 3).setValue("❌ 게시 실패");
  }
}