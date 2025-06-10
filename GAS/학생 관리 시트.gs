// 📌 문서 열릴 때 메뉴 생성
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📂 자동화 도구')
    .addItem('🧑 학생 시트 만들기', 'createSemesterSheetIfNotExists')
    .addItem('📁 폴더 생성 및 메일 발송', 'createStudentFoldersFromManagementSheet')
    .addItem('🚀 과제 업데이트', 'updateDocsByHeaders')
    .addItem('🪐 과제 불러오기', 'loadAssignmentFromSheetName') 
    .addItem('📊 자동 평가', 'evaluateByCustomRubricWithInlineMaxPoints')
    .addItem('📩 평가 결과 이메일 발송', 'sendEvaluationEmails')
    .addToUi();
}

// ✅ A1 기준으로 학생 시트 자동 생성
function createSemesterSheetIfNotExists() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("관리");
  const sheetName = configSheet.getRange("A1").getValue().toString().trim();

  if (!sheetName) {
    SpreadsheetApp.getUi().alert("📌 '관리' 시트의 A1에 생성할 시트명을 입력해주세요.");
    return;
  }

  const existingSheet = ss.getSheetByName(sheetName);
  if (existingSheet) {
    SpreadsheetApp.getUi().alert(`✅ '${sheetName}' 시트는 이미 존재합니다.`);
    return;
  }

  const newSheet = ss.insertSheet(sheetName);
  newSheet.appendRow(["이름", "이메일", "폴더 링크", "발송 시각", "상태"]); // 과제 열은 직접 추가

  SpreadsheetApp.getUi().alert(`📄 '${sheetName}' 시트가 생성되었습니다. 이제 학생 명단을 입력하고, 과제명을 G1부터 입력해 주세요.`);
}

// ✅ 폴더 생성 + 메일 발송 + 시트 직접 기록
function createStudentFoldersFromManagementSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("관리");

  const sheetName = configSheet.getRange("A1").getValue().toString().trim();
  const folderUrl = configSheet.getRange("B1").getValue().toString().trim();

  if (!sheetName || !folderUrl) {
    SpreadsheetApp.getUi().alert("⚠️ '관리' 시트의 A1에 시트명, B1에 상위 폴더 링크를 입력해주세요.");
    return;
  }

  const folderIdMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!folderIdMatch) {
    SpreadsheetApp.getUi().alert("❌ B1에 올바른 구글 드라이브 폴더 링크를 입력해주세요.");
    return;
  }

  const folderId = folderIdMatch[1];
  const parentFolder = DriveApp.getFolderById(folderId);
  const targetSheet = ss.getSheetByName(sheetName);
  if (!targetSheet) {
    SpreadsheetApp.getUi().alert(`❌ '${sheetName}' 시트를 찾을 수 없습니다.`);
    return;
  }

  const data = targetSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    const email = data[i][1];
    const existingLink = data[i][2];
    const timestampCell = targetSheet.getRange(i + 1, 4);
    const statusCell = targetSheet.getRange(i + 1, 5);

    if (!name) {
      statusCell.setValue("⚠️ 이름 없음");
      continue;
    }

    if (existingLink) {
      statusCell.setValue("📁 기존 폴더 있음");
      continue;
    }

    if (!email) {
      statusCell.setValue("⚠️ 이메일 없음");
      continue;
    }

    try {
      const existingFolders = parentFolder.getFoldersByName(name);
      let folder, folderLink;

      if (existingFolders.hasNext()) {
        folder = existingFolders.next();
        folderLink = folder.getUrl();
        statusCell.setValue("📁 기존 폴더 있음");
      } else {
        folder = parentFolder.createFolder(name);
        folderLink = folder.getUrl();
        statusCell.setValue("✅ 새 폴더 생성됨");
      }

      targetSheet.getRange(i + 1, 3).setValue(folderLink);
      timestampCell.setValue(new Date());

      const subject = `[${name}님] 개인 폴더가 생성되었습니다`;
      const htmlBody = `
        <div style="font-family: 'Noto Sans KR', sans-serif; padding: 20px;">
          <h2 style="color: #2c3e50;">${name}님, 안녕하세요!</h2>
          <p>개인 학습용 구글 드라이브 폴더가 성공적으로 생성되었습니다. 아래 버튼을 클릭하여 바로 접속하실 수 있습니다.</p>
          <p style="margin: 30px 0;">
            <a href="${folderLink}" target="_blank"
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              폴더 열기
            </a>
          </p>
          <p>이 폴더는 수업 자료 업로드 및 과제 제출 등에 활용됩니다.<br>필요 시 언제든지 접근 가능합니다.</p>
          <hr style="margin: 30px 0;">
          <p style="font-size: 12px; color: #888;">이 메일은 시스템에 의해 자동 발송되었습니다.<br>질문이 있으시면 담당자에게 문의해 주세요.</p>
        </div>
      `.trim();

      GmailApp.sendEmail(email, subject, "", { htmlBody });
      statusCell.setValue("✅ 발송 완료");

    } catch (error) {
      timestampCell.setValue(new Date());
      statusCell.setValue(`❌ 오류: ${error.message}`);
    }
  }

  SpreadsheetApp.getUi().alert(`✅ '${sheetName}' 시트의 폴더 생성 및 이메일 발송이 완료되었습니다.`);
}

// ✅ 헤더 키워드 기준 과제 파일 필터링 후 링크 삽입
function updateDocsByHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("관리");
  const studentSheetName = configSheet.getRange("A1").getValue().toString().trim();
  const folderUrl = configSheet.getRange("B1").getValue().toString().trim();
  const studentSheet = ss.getSheetByName(studentSheetName);

  const folderIdMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!folderIdMatch) {
    SpreadsheetApp.getUi().alert("❌ 상위 폴더 링크가 잘못되었습니다.");
    return;
  }

  const parentFolder = DriveApp.getFolderById(folderIdMatch[1]);
  const subFolders = parentFolder.getFolders();
  const headers = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
  const studentData = studentSheet.getDataRange().getValues();

  while (subFolders.hasNext()) {
    const folder = subFolders.next();
    const folderName = folder.getName();

    for (let i = 1; i < studentData.length; i++) {
      const studentName = studentData[i][0];
      if (folderName === studentName) {
        const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
        const allFiles = [];

        while (files.hasNext()) {
          const file = files.next();
          allFiles.push({
            name: file.getName().toLowerCase(),
            url: file.getUrl()
          });
        }

        for (let col = 6; col < headers.length; col++) {
          const rawKeyword = headers[col];
          if (!rawKeyword || rawKeyword.toString().trim() === "") continue;

          const keyword = rawKeyword.toString().toLowerCase().trim();
          const match = allFiles.find(f => f.name.includes(keyword));

          if (match) {
            studentSheet.getRange(i + 1, col + 1).setValue(match.url);
          } else {
            studentSheet.getRange(i + 1, col + 1).setValue("❌ 없음");
          }
        }
      }
    }
  }

  SpreadsheetApp.getUi().alert("✅ 과제명 기준 Google Docs 링크가 업데이트되었습니다.");
}

function loadAssignmentFromSheetName() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const thisSheet = ss.getActiveSheet();
  const sheetTitle = thisSheet.getName().trim();

  if (!sheetTitle.includes("-")) {
    SpreadsheetApp.getUi().alert("❌ 시트 이름이 '시트명-과제명' 형식이 아닙니다. 예: 2025_1학기-과제1");
    return;
  }

  const [sourceSheetName, assignmentKeyword] = sheetTitle.split("-").map(str => str.trim());
  if (!sourceSheetName || !assignmentKeyword) {
    SpreadsheetApp.getUi().alert("❌ 시트명 또는 과제명이 비어 있습니다.");
    return;
  }

  const sourceSheet = ss.getSheetByName(sourceSheetName);
  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert(`❌ 시트 '${sourceSheetName}'를 찾을 수 없습니다.`);
    return;
  }

  const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
  const assignmentColIndex = headers.findIndex(h => h.toString().trim() === assignmentKeyword);
  if (assignmentColIndex === -1) {
    SpreadsheetApp.getUi().alert(`❌ '${assignmentKeyword}' 열을 '${sourceSheetName}' 시트에서 찾을 수 없습니다.`);
    return;
  }

  const data = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, sourceSheet.getLastColumn()).getValues();
  const output = data.map(row => [row[0], row[1], row[assignmentColIndex]]); // 이름, 이메일, 과제 링크

  // A1~C1 제목, A2~ 데이터 출력
  thisSheet.getRange("A1:C").clearContent();
  thisSheet.getRange(1, 1, 1, 3).setValues([["이름", "이메일", assignmentKeyword]]);
  thisSheet.getRange(2, 1, output.length, 3).setValues(output);

  SpreadsheetApp.getUi().alert(`✅ '${assignmentKeyword}' 링크가 '${sourceSheetName}' 시트에서 불러와졌습니다.`);
}


// 🚀 과제 평가
const GEMINI_API_KEY = "YOUR API KEY";

// 📊 자동 평가 함수
function evaluateByCustomRubricWithInlineMaxPoints() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const rubricHeaders = headers.slice(3).filter(h => h.toString().trim() !== "");

  const rubricItems = rubricHeaders.map(raw => {
    const match = raw.match(/^(.+?)\((\d+)\)$/);
    if (match) {
      return { name: match[1].trim(), max: parseInt(match[2]) };
    } else {
      return { name: raw.trim(), max: null };
    }
  });

  const totalIndex = rubricItems.findIndex(r => r.name === "총점");
  const feedbackIndex = rubricItems.findIndex(r => r.name === "피드백");

  if (totalIndex === -1) {
    SpreadsheetApp.getUi().alert("❗ '총점' 항목이 포함되어 있어야 합니다.");
    return;
  }

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    const docUrl = data[i][2];
    if (!docUrl || !docUrl.includes("http")) continue;

    try {
      const docId = extractDocId(docUrl);
      const text = DocumentApp.openById(docId).getBody().getText();
      const prompt = buildPromptWithMaxPoints(name, text, rubricItems);
      const resultText = callGeminiAPI(prompt, GEMINI_API_KEY);
      const parsed = JSON.parse(resultText);

      rubricItems.forEach((item, idx) => {
        const col = 4 + idx;
        const value = parsed[item.name] ?? "";
        sheet.getRange(i + 1, col).setValue(value);
      });

    } catch (e) {
      sheet.getRange(i + 1, 4).setValue("❌ 오류: " + e.message);
    }
  }

  SpreadsheetApp.getUi().alert("✅ 자동 평가가 완료되었습니다.");
}

// 📋 프롬프트 생성 함수
function buildPromptWithMaxPoints(name, text, rubricItems) {
  const scoringItems = rubricItems.filter(r => r.name !== "총점" && r.name !== "피드백");

  const rubricText = scoringItems
    .map(item => `- ${item.name} (${item.max}점)`)
    .join("\n");

  const outputFields = scoringItems
    .map(item => `"${item.name}": 숫자`)
    .join(",\n");

  const hasFeedback = rubricItems.some(r => r.name === "피드백");
  const feedbackLine = hasFeedback ? `,
"피드백": "학생의 과제를 아래의 4가지 요소로 정리된 서술형 피드백으로 작성해주세요.

1. 평가: 전반적인 인상과 총평
2. 강점: 잘한 점을 2~3가지 서술
3. 개선점: 보완이 필요한 부분을 구체적으로 설명
4. 종합 마무리: 격려와 다음 단계 제안

※ 리스트 기호(*, -, 숫자), 마크다운(**, ## 등)은 절대 사용하지 말고 자연스럽고 단정한 문장으로, JSON 전체는 반드시 한 줄로 반환해주세요."
` : "";

  return `
당신은 교육 평가 전문가입니다. 아래 학생의 과제를 기준에 따라 평가하고 점수와 피드백을 JSON 형식으로 작성해주세요.

📘 학생: ${name}

📄 과제 내용:
${text}

📊 평가 기준:
${rubricText}

📌 출력 형식 (JSON):
{
${outputFields},
"총점": 숫자${feedbackLine}
}
`.trim();
}

// 📎 Google Docs 문서 ID 추출
function extractDocId(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

// 🤖 Gemini 호출 + JSON 정제
function callGeminiAPI(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  try {
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = content.match(/{[\s\S]*}/);
    if (!jsonMatch) throw new Error("JSON 형식 결과를 찾을 수 없습니다.");

    const cleaned = jsonMatch[0].replace(/[\u0000-\u001F]/g, ' ');
    return cleaned;
  } catch (e) {
    throw new Error("Gemini 응답 파싱 실패: " + JSON.stringify(result));
  }
}



// 🚀 평가 결과 이메일 발송

function sendEvaluationEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const rubricHeaders = data[0].slice(3);

  // 📌 상태 열이 존재하는지 확인, 없으면 추가
  const statusCol = 3 + rubricHeaders.length + 1;
  const statusHeader = sheet.getRange(1, statusCol).getValue();
  if (!statusHeader || statusHeader.toString().trim() === "") {
    sheet.getRange(1, statusCol).setValue("상태");
  }

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    const email = data[i][1];
    const docUrl = data[i][2];
    const statusCell = sheet.getRange(i + 1, statusCol);

    if (!email || !email.includes("@")) {
      statusCell.setValue("❌ 이메일 없음");
      continue;
    }

    if (!docUrl || !docUrl.includes("http")) {
      statusCell.setValue("❌ 과제 링크 없음");
      continue;
    }

    try {
      const rubricScores = data[i].slice(3, 3 + rubricHeaders.length);
      const totalIndex = rubricHeaders.findIndex(h => h === "총점");
      const feedbackIndex = rubricHeaders.findIndex(h => h === "피드백");
      const totalScore = rubricScores[totalIndex] ?? "";
      const feedback = rubricScores[feedbackIndex] ?? "";

      let scoreTable = rubricHeaders
        .map((header, idx) => {
          if (header === "피드백") return "";
          return `<tr><td style="padding:4px 8px;">${header}</td><td style="padding:4px 8px;">${rubricScores[idx]}</td></tr>`;
        })
        .join("");

      const htmlBody = `
        <div style="font-family:'Noto Sans KR', sans-serif;">
          <h3>${name}님, 과제 평가 결과를 안내드립니다.</h3>
          <p>제출하신 문서: <a href="${docUrl}" target="_blank"> 과제 보기</a></p>
          <table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse; margin-top: 10px;">
            <thead><tr style="background-color:#f0f0f0;"><th>평가 항목</th><th>점수</th></tr></thead>
            <tbody>${scoreTable}</tbody>
          </table>
          <p style="margin-top:10px;"><strong>총점: ${totalScore}점</strong></p>
          <p style="margin-top:10px;"><strong>피드백:</strong><br>${feedback}</p>
          <hr>
          <p style="font-size:12px; color:gray;">이 메일은 자동으로 발송되었습니다. 궁금한 점은 교수자에게 문의해주세요.</p>
        </div>
      `.trim();

      GmailApp.sendEmail(email, `[과제 평가 결과] ${name}님`, "", {
        htmlBody: htmlBody
      });

      statusCell.setValue("✅ 발송 완료");

    } catch (e) {
      statusCell.setValue(`❌ 오류: ${e.message}`);
    }
  }

  SpreadsheetApp.getUi().alert("✅ 평가 결과 이메일 발송이 완료되었습니다.");
}

