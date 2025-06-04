function doGet() {
  return HtmlService.createHtmlOutputFromFile('chat')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function writeChatMessage(nickname, message) {
  try {
    // 스프레드시트 가져오기
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('채팅');
    
    // 시트가 없으면 생성
    if (!sheet) {
      sheet = ss.insertSheet('채팅');
      sheet.appendRow(['시간', '닉네임', '메시지']);
    }
    
    // 메시지 저장
    sheet.appendRow([new Date(), nickname, message]);
    return true;
  } catch (error) {
    console.error('메시지 저장 오류:', error);
    throw new Error('메시지를 저장할 수 없습니다: ' + error.message);
  }
}

function getAllMessages() {
  try {
    // 스프레드시트 가져오기
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('채팅');
    
    // 시트가 없거나 데이터가 없으면 빈 배열 반환
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // 헤더만 있으면 빈 배열
    
    // 헤더 제외하고 데이터 변환
    var messages = [];
    for (var i = 1; i < data.length; i++) {
      messages.push({
        user: data[i][1] || '익명',
        message: data[i][2] || ''
      });
    }
    
    return messages;
  } catch (error) {
    console.error('메시지 로드 오류:', error);
    throw new Error('메시지를 불러올 수 없습니다: ' + error.message);
  }
}