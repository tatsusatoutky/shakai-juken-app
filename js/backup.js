// 学習進捗のJSONバックアップ書き出し／読み込み（SPEC.md 8-6章を参照）
const Backup = {
  exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      cards: Storage.getCards(),
      settings: Storage.getSettings(),
      testResults: Storage.getTestResults(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `shakai-juken-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // file: <input type="file"> から得たFileオブジェクト。復元後のデータを解決するPromiseを返す
  importData(file) {
    return file.text().then((text) => {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object") throw new Error("バックアップファイルの形式が正しくありません");
      if (data.cards) Storage.saveCards(data.cards);
      if (data.settings) Storage.saveSettings(data.settings);
      if (data.testResults) Storage.saveTestResults(data.testResults);
      return data;
    });
  },
};
