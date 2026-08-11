// localStorage への保存・読み込み（端末内のみ、サーバー送信なし）
const Storage = {
  _key(name) {
    return CONFIG.STORAGE_PREFIX + name;
  },

  // SRSCard を entryId をキーにしたオブジェクトで保持する
  getCards() {
    try {
      return JSON.parse(localStorage.getItem(this._key("cards"))) || {};
    } catch (e) {
      return {};
    }
  },
  saveCards(cards) {
    localStorage.setItem(this._key("cards"), JSON.stringify(cards));
  },

  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this._key("settings"))) || {};
    } catch (e) {
      return {};
    }
  },
  saveSettings(settings) {
    localStorage.setItem(this._key("settings"), JSON.stringify(settings));
  },

  // TestResult（SPEC.md 3-6）の配列。新しい結果が先頭に来る想定
  getTestResults() {
    try {
      return JSON.parse(localStorage.getItem(this._key("testResults"))) || [];
    } catch (e) {
      return [];
    }
  },
  saveTestResults(results) {
    localStorage.setItem(this._key("testResults"), JSON.stringify(results));
  },
};
