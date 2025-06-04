function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  
  if (range.getColumn() === 1 && range.getRow() > 1) {
    const korean = range.getValue();
    const translated = LanguageApp.translate(korean, 'ko', 'zh-CN');
    sheet.getRange(range.getRow(), 2).setValue(translated);
  }
}