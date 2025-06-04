function syncImageList() {
  const folderId = 'YOUR FOLDER ID';
  const sheet = SpreadsheetApp.openById('YOUR SHEET ID').getSheetByName('시트1');
  const files = DriveApp.getFolderById(folderId).getFiles();

  const driveFiles = {};
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();

    if (!name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) continue;

    const formattedTime = Utilities.formatDate(
      file.getLastUpdated(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );

    driveFiles[name] = {
      url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1000`,
      time: formattedTime
    };
  }

  const data = sheet.getDataRange().getValues();

  // ✅ 헤더가 없거나 열 개수가 맞지 않을 경우 자동 생성
  const header = data[0] || [];
  const newData = [header.length === 3 ? header : ['FileName', 'ImageURL', 'UploadedAt']];

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    if (driveFiles[name]) {
      newData.push([name, driveFiles[name].url, driveFiles[name].time]);
      delete driveFiles[name];
    }
  }

  for (let name in driveFiles) {
    newData.push([name, driveFiles[name].url, driveFiles[name].time]);
  }

  // 최신순 정렬 (업로드 시간 기준)
  newData.sort((a, b) => new Date(b[2]) - new Date(a[2]));

  sheet.clearContents();
  sheet.getRange(1, 1, newData.length, 3).setValues(newData);
}
